"""film.py's render driver and failure paths, with Blender and ffmpeg replaced at the
process boundary: a fake worker writes the frames a real one would."""

import contextlib
import io
import json
import runpy
import subprocess
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

import helpers

common = helpers.load("common")
film = helpers.load("film")

PANEL = (64, 36)


def write_frame(path, size=PANEL):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, (90, 60, 30)).save(path)


class FilmCase(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name).resolve()
        self.blender = self.root / "blender"
        self.blender.write_text("not run")

    def configure(self, **overrides):
        settings = {
            "shot_seconds": 1.0,
            "width": PANEL[0],
            "height": PANEL[1],
            "blender": str(self.blender),
        }
        settings.update(overrides)
        return common.read_config(helpers.write_config(self.root, **settings))


class FakeWorker:
    """Stands in for subprocess.run on the worker command: renders the job's frames."""

    def __init__(self, returncode=0, skip=()):
        self.calls = []
        self.returncode = returncode
        self.skip = set(skip)

    def __call__(self, args, env, stdout, stderr):
        mode, job, run_dir, kind, _ = args[args.index("--") + 1 :]
        batch = json.loads(Path(job).read_text())
        self.calls.append({"args": args, "env": env, "batch": batch})
        stdout.write(f"rendering {mode} {batch}\n")
        if self.returncode:
            stdout.write("Error: EEVEE ran out of memory\n")
        else:
            for frame in batch:
                if frame not in self.skip:
                    write_frame(film.frame_path(Path(run_dir), kind, mode, frame))
        return subprocess.CompletedProcess(args, self.returncode)


class RenderPassTests(FilmCase):
    def render_pass(self, worker, mode="original", kind="run", batch=5):
        config, config_path = self.configure()
        run = self.root / "run"
        run.mkdir(exist_ok=True)
        fake = SimpleNamespace(run=worker, STDOUT=subprocess.STDOUT)
        with (
            mock.patch.object(film, "subprocess", fake),
            mock.patch.object(film, "BATCH_FRAMES", batch),
        ):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                film.render_pass(config, config_path, run, kind, mode)
        return config, config_path, run, out.getvalue()

    def test_renders_missing_frames_in_bounded_batches(self):
        run = self.root / "run"
        write_frame(film.frame_path(run, "run", "original", 1))
        corrupt = film.frame_path(run, "run", "original", 3)
        corrupt.write_bytes(b"half a png")
        worker = FakeWorker()
        config, config_path, run, printed = self.render_pass(worker)
        frames = common.expected(config, "run")
        self.assertEqual(len(frames), 24)
        batches = [call["batch"] for call in worker.calls]
        self.assertEqual(
            batches, [frames[1:6], frames[6:11], frames[11:16], frames[16:21], frames[21:]]
        )
        for call in worker.calls:
            self.assertEqual(call["env"]["PATINA_CONFIG"], str(config_path))
            args = call["args"]
            self.assertEqual(args[0], str(self.blender))
            self.assertEqual(args[3], config["before"])
        self.assertTrue(
            all(film.valid_png(film.frame_path(run, "run", "original", f)) for f in frames)
        )
        self.assertEqual(len(list((corrupt.parent / "archive").glob("0003_*.png"))), 1)
        reports = [json.loads(line) for line in printed.splitlines()]
        self.assertEqual(len(reports), 5)
        self.assertEqual(reports[-1]["frames"]["original"], 24)
        self.assertEqual(json.loads((run / "run_original_0.json").read_text()), frames[1:6])
        self.assertIn("rendering original", (run / "run_original_0.log").read_text())

    def test_patina_pass_renders_the_after_scene(self):
        worker = FakeWorker()
        config, _, _, _ = self.render_pass(worker, mode="patina", kind="pilot", batch=132)
        self.assertEqual(len(worker.calls), 1)
        self.assertEqual(worker.calls[0]["args"][3], config["after"])
        self.assertEqual(worker.calls[0]["batch"], common.expected(config, "pilot"))

    def test_finished_pass_launches_nothing(self):
        config, _ = self.configure()
        run = self.root / "run"
        for frame in common.expected(config, "pilot"):
            write_frame(film.frame_path(run, "pilot", "original", frame))
        worker = FakeWorker()
        self.render_pass(worker, kind="pilot")
        self.assertEqual(worker.calls, [])

    def test_worker_failure_quotes_the_log_tail(self):
        with self.assertRaises(RuntimeError) as caught:
            self.render_pass(FakeWorker(returncode=1))
        message = str(caught.exception)
        self.assertIn("run_original_0.log", message)
        self.assertIn("EEVEE ran out of memory", message)

    def test_clean_exit_with_missing_frames_is_an_error(self):
        with self.assertRaises(RuntimeError) as caught:
            self.render_pass(FakeWorker(skip=[5, 7]))
        self.assertEqual(
            str(caught.exception),
            "original run: worker exited cleanly, frames missing: [5, 7]",
        )


class RenderTests(FilmCase):
    def fake_pass(self, settings):
        def render_pass(config, config_path, run_dir, kind, mode):
            for frame in common.expected(config, kind):
                write_frame(film.frame_path(run_dir, kind, mode, frame))
            contract = {"camera_sha256": "c", "settings": settings[mode], "geometry_sha256": "g"}
            (run_dir / f"{mode}_contract.json").write_text(json.dumps(contract))

        return render_pass

    def render(self, kind, settings=None):
        settings = settings or {"original": {"engine": "E"}, "patina": {"engine": "E"}}
        config, config_path = self.configure(workers=2)
        run = self.root / "run"
        run.mkdir(exist_ok=True)
        with mock.patch.object(film, "render_pass", self.fake_pass(settings)):
            film.render(config, config_path, run, kind)
        return run

    def test_pilot_writes_an_estimate_once_and_a_contact_sheet(self):
        run = self.render("pilot")
        estimate = json.loads((run / "pilot_estimate.json").read_text())
        self.assertEqual(
            set(estimate), {"pilot_elapsed_seconds", "rough_render_estimate_seconds", "note"}
        )
        self.assertGreaterEqual(estimate["rough_render_estimate_seconds"], 0)
        self.assertTrue((run / "Pilot Contact.jpg").is_file())
        (run / "pilot_estimate.json").write_text('{"kept": true}')
        (run / "Pilot Contact.jpg").unlink()
        self.render("pilot")
        self.assertEqual(json.loads((run / "pilot_estimate.json").read_text()), {"kept": True})
        self.assertTrue((run / "Pilot Contact.jpg").is_file())

    def test_full_run_skips_the_pilot_outputs(self):
        run = self.render("run")
        self.assertFalse((run / "pilot_estimate.json").exists())
        self.assertFalse((run / "Pilot Contact.jpg").exists())

    def test_passes_that_disagree_are_refused(self):
        settings = {"original": {"engine": "BLENDER_EEVEE"}, "patina": {"engine": "CYCLES"}}
        with self.assertRaises(RuntimeError) as caught:
            self.render("run", settings)
        self.assertEqual(str(caught.exception), "Before/after mismatch: settings")


class SmallPathTests(FilmCase):
    def test_command_failure_raises_with_the_log(self):
        log = self.root / "step.log"
        script = "import sys; print('decoder said no'); sys.exit(3)"
        with self.assertRaises(RuntimeError) as caught:
            film.command([sys.executable, "-c", script], log)
        self.assertTrue(str(caught.exception).startswith(f"{log}: "))
        self.assertIn("decoder said no", str(caught.exception))
        film.command([sys.executable, "-c", "print('fine')"], log)
        self.assertEqual(log.read_text().strip(), "fine")

    def test_configured_font_file_is_loaded_at_the_requested_size(self):
        font = self.root / "Caption.ttf"
        font.write_bytes(b"font")
        with mock.patch.object(film.ImageFont, "truetype", return_value="loaded") as truetype:
            self.assertEqual(film.load_font({"bold_font": str(font)}, 31, bold=True), "loaded")
        truetype.assert_called_once_with(str(font), 31)

    def test_status_carries_the_pilot_estimate(self):
        config, _ = self.configure()
        run = self.root / "run"
        run.mkdir()
        (run / "pilot_estimate.json").write_text('{"rough_render_estimate_seconds": 90}')
        report = film.status(config, run)
        self.assertEqual(report["pilot"], {"rough_render_estimate_seconds": 90})

    def test_status_counts_an_encode_only_while_its_outputs_exist(self):
        config, _ = self.configure()
        run = self.root / "run"
        write_frame(film.frame_path(run, "run", "original", 1))
        master = run / "PATINA Comparison.mp4"
        share = run / "PATINA Comparison Share.mp4"
        for path in (master, share):
            path.write_bytes(b"mp4")
        outputs = [{"path": str(master)}, {"path": str(share)}]
        (run / "verification.json").write_text(json.dumps({"outputs": outputs}))
        self.assertEqual(film.status(config, run)["stage"], "encoded")
        share.unlink()
        self.assertEqual(film.status(config, run)["stage"], "rendering")

    def test_existing_plate_is_reused(self):
        config, _ = self.configure()
        plate = self.root / "Layout.png"
        plate.write_bytes(b"kept")
        self.assertEqual(film.draw_plate(config, plate), plate)
        self.assertEqual(plate.read_bytes(), b"kept")

    def test_wrong_frame_size_is_rejected(self):
        config, _ = self.configure()
        run = self.root / "run"
        for mode in film.MODES:
            for frame in common.expected(config, "run"):
                write_frame(film.frame_path(run, "run", mode, frame))
        odd = film.frame_path(run, "run", "patina", 5)
        write_frame(odd, (32, 18))
        with self.assertRaises(RuntimeError) as caught:
            film.check_frames(config, run)
        self.assertEqual(str(caught.exception), f"{odd}: size (32, 18), expected (64, 36)")


class EncodeTests(FilmCase):
    def stage_frames(self, config, run, mode="patina"):
        for frame in common.expected(config, "run"):
            write_frame(film.frame_path(run, "run", mode, frame))

    def test_clip_copies_frames_when_hard_links_fail(self):
        config, _ = self.configure()
        run = self.root / "run"
        self.stage_frames(config, run)
        with mock.patch.object(film.os, "link", side_effect=OSError("cross-device link")):
            with mock.patch.object(film, "ffmpeg") as encode:
                out = film.encode_clip(config, run, "patina", 1)
        self.assertEqual(out, run / "clips" / "patina_01.mp4")
        staged = sorted((run / "sequence" / "patina" / "01").glob("*.png"))
        self.assertEqual(len(staged), 12)
        source = film.frame_path(run, "run", "patina", 25)
        self.assertEqual(staged[0].read_bytes(), source.read_bytes())
        self.assertEqual(staged[0].stat().st_nlink, 1)
        args = encode.call_args.args[1]
        self.assertEqual(args[args.index("-framerate") + 1], "12")
        self.assertEqual(args[args.index("-frames:v") + 1], "24")
        self.assertIn("framerate=fps=24", args[args.index("-vf") + 1])
        self.assertEqual(encode.call_args.args[3], "patina_1")

    def test_full_rate_source_needs_no_interpolation(self):
        config, _ = self.configure(source_fps=24)
        run = self.root / "run"
        self.stage_frames(config, run)
        with mock.patch.object(film, "ffmpeg") as encode:
            film.encode_clip(config, run, "patina", 0)
        args = encode.call_args.args[1]
        self.assertEqual(
            args[args.index("-vf") + 1], "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
        )
        self.assertEqual(len(list((run / "sequence" / "patina" / "00").glob("*.png"))), 24)

    def test_join_with_the_wrong_frame_count_fails(self):
        config, _ = self.configure()
        run = self.root / "run"
        run.mkdir()
        with (
            mock.patch.object(film, "ffmpeg"),
            mock.patch.object(film, "frame_count", return_value=30),
        ):
            with self.assertRaises(RuntimeError) as caught:
                film.join_clips(config, run, "original")
        joined = run / "Original Matched Camera.mp4"
        self.assertEqual(str(caught.exception), f"{joined}: 30 frames after the join, expected 36")


class AssembleVerificationTests(FilmCase):
    def assemble_with(self, frames, duration):
        config, _ = self.configure()
        run = self.root / "run"
        run.mkdir()
        info = {
            "streams": [
                {"codec_type": "audio"},
                {"codec_type": "video", "nb_read_frames": str(frames), "width": 80, "height": 88},
            ],
            "format": {"duration": str(duration)},
        }
        patches = [
            mock.patch.object(film, "check_frames"),
            mock.patch.object(film, "encode_clip"),
            mock.patch.object(film, "join_clips", side_effect=lambda c, r, m: r / f"{m}.mp4"),
            mock.patch.object(film, "stack", return_value=run / "master.mp4"),
            mock.patch.object(film, "share_copy", return_value=run / "share.mp4"),
            mock.patch.object(film, "probe", return_value=info),
        ]
        with contextlib.ExitStack() as stack:
            for patch in patches:
                stack.enter_context(patch)
            return film.assemble(config, run)

    def test_short_output_is_rejected(self):
        with self.assertRaises(RuntimeError) as caught:
            self.assemble_with(35, 1.5)
        self.assertTrue(str(caught.exception).endswith("master.mp4: 35 frames, expected 36"))

    def test_drifting_duration_is_rejected(self):
        with self.assertRaises(RuntimeError) as caught:
            self.assemble_with(36, 1.6)
        self.assertTrue(str(caught.exception).endswith("master.mp4: duration 1.6, expected 1.5"))


class MainTests(FilmCase):
    def test_blender_flag_reaches_the_render_and_pilot_skips_assembly(self):
        _, config_path = self.configure(blender=None)
        override = str(self.root / "other-blender")
        with (
            mock.patch.object(film, "render") as render,
            mock.patch.object(film, "assemble") as assemble,
        ):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                result = film.main([str(config_path), "pilot", "--blender", override])
        config, _, run_dir, kind = render.call_args.args
        self.assertEqual(config["blender"], override)
        self.assertEqual(kind, "pilot")
        self.assertTrue(run_dir.is_dir())
        assemble.assert_not_called()
        self.assertEqual(json.loads(out.getvalue()), result)

    def test_run_renders_then_assembles(self):
        _, config_path = self.configure()
        order = []
        with mock.patch.object(film, "render", side_effect=lambda *a: order.append("render")):
            with mock.patch.object(
                film, "assemble", side_effect=lambda *a: order.append("assemble")
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    film.main([str(config_path), "run"])
        self.assertEqual(order, ["render", "assemble"])

    def test_script_prints_status(self):
        _, config_path = self.configure()
        argv = ["film.py", str(config_path), "status"]
        with mock.patch.object(sys, "argv", argv):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                runpy.run_path(str(helpers.SCRIPTS / "film.py"), run_name="__main__")
        report = json.loads(out.getvalue())
        self.assertEqual(report["stage"], "prepared")
        self.assertEqual(report["required_per_pass"], 24)


if __name__ == "__main__":
    unittest.main()
