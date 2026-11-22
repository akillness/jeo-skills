import contextlib
import io
import json
import math
import shutil
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path

from PIL import Image


import helpers

common = helpers.load("common")
film = helpers.load("film")

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
PANEL = (64, 36)


def tiny_config(folder, **overrides):
    settings = {"shot_seconds": 1.0, "width": PANEL[0], "height": PANEL[1]}
    settings.update(overrides)
    return common.read_config(helpers.write_config(folder, **settings))


def write_frame(path, frame, mode):
    path.parent.mkdir(parents=True, exist_ok=True)
    shade = (frame * 5) % 256
    color = (shade, 40, 200 - shade // 2) if mode == "original" else (200 - shade // 2, shade, 40)
    Image.new("RGB", PANEL, color).save(path)


class LayoutTests(unittest.TestCase):
    def test_default_panels_stack_to_2560_by_3200(self):
        geometry = film.layout(2368, 1332)
        self.assertEqual((geometry["width"], geometry["height"]), (2560, 3200))
        self.assertEqual(geometry["pad"], 96)
        self.assertEqual(geometry["header"], 240)
        self.assertEqual(geometry["after_y"], 240 + 1332 + geometry["gap"])

    def test_tiny_panels_stay_even(self):
        geometry = film.layout(*PANEL)
        self.assertEqual((geometry["width"], geometry["height"]), (80, 88))
        for width, height in ((1920, 1080), (1280, 720), PANEL, (2368, 1332)):
            geometry = film.layout(width, height)
            for key in ("pad", "header", "gap", "bottom", "width", "height"):
                self.assertEqual(geometry[key] % 2, 0, (width, key))

    def test_final_duration(self):
        with tempfile.TemporaryDirectory() as folder:
            config, _ = tiny_config(folder)
            self.assertAlmostEqual(film.final_duration(config), 1.5)
            shots = [helpers.shot(str(i)) for i in range(12)]
            config, _ = tiny_config(folder, shot_seconds=5.5, shots=shots)
            self.assertAlmostEqual(film.final_duration(config), 60.5)


class PlumbingTests(unittest.TestCase):
    def test_worker_gets_the_config_path_as_an_argument(self):
        args = film.worker_command(
            "/bin/blender",
            "/p/Before.blend",
            "original",
            Path("/r/job.json"),
            Path("/r"),
            "pilot",
            Path("/p/film.json"),
        )
        self.assertEqual(args[0], "/bin/blender")
        self.assertIn("--python-exit-code", args)
        tail = ["original", "/r/job.json", "/r", "pilot", "/p/film.json"]
        self.assertEqual(args[args.index("--") + 1 :], tail)
        self.assertTrue(args[args.index("--python") + 1].endswith("worker.py"))

    def test_fonts_fall_back_and_configured_paths_must_exist(self):
        font = film.load_font({}, 20)
        self.assertTrue(hasattr(font, "getbbox"))
        self.assertTrue(hasattr(film.load_font({}, 20, bold=True), "getbbox"))
        with self.assertRaises(FileNotFoundError):
            film.load_font({"font": "/no/such/font.ttf"}, 20)

    def test_old_pillow_without_a_sized_default_font_names_the_config_key(self):
        with mock.patch.dict(film.FONTS, {"font": ("/no/font.ttf",)}):
            with mock.patch.object(film.ImageFont, "load_default", side_effect=TypeError("size")):
                with self.assertRaises(FileNotFoundError) as caught:
                    film.load_font({}, 20)
        self.assertIn('"font"', str(caught.exception))
        self.assertIn("10.1", str(caught.exception))

    def test_join_restores_the_frame_rate_xfade_needs(self):
        # ffmpeg 6.x accepts the old graph, so AssembleTests cannot catch a regression there.
        with tempfile.TemporaryDirectory() as folder:
            config, _ = tiny_config(folder, shots=[helpers.shot(str(i)) for i in range(3)])
            run = Path(folder) / "run"
            run.mkdir()
            frames = round(film.final_duration(config) * config["fps"])
            with mock.patch.object(film, "ffmpeg") as encode:
                with mock.patch.object(film, "frame_count", return_value=frames):
                    film.join_clips(config, run, "patina")
        args = encode.call_args.args[1]
        graph = args[args.index("-filter_complex") + 1].split(";")
        for index in range(3):
            chain = next(f for f in graph if f.startswith(f"[{index}:v]"))
            steps = [s.split("=")[0] for s in chain.split("]")[1].split("[")[0].split(",")]
            names = [s for s in steps if s in ("setpts", "fps", "settb")]
            self.assertEqual(names, ["setpts", "fps", "settb"], chain)

    def test_status_on_a_fresh_run(self):
        with tempfile.TemporaryDirectory() as folder:
            config, _ = tiny_config(folder)
            run = Path(folder) / "run"
            run.mkdir()
            report = film.status(config, run)
            self.assertEqual(report["stage"], "prepared")
            self.assertEqual(report["frames"], {"original": 0, "patina": 0})
            self.assertEqual(report["required_per_pass"], 24)
            self.assertEqual(json.loads((run / "status.json").read_text()), report)
            write_frame(film.frame_path(run, "run", "patina", 1), 1, "patina")
            self.assertEqual(film.status(config, run)["stage"], "rendering")

    def test_valid_png_and_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            good = Path(folder) / "good.png"
            Image.new("RGB", (2, 2)).save(good)
            bad = Path(folder) / "bad.png"
            bad.write_bytes(b"not a png")
            self.assertTrue(film.valid_png(good))
            self.assertFalse(film.valid_png(bad))
            self.assertFalse(film.valid_png(Path(folder) / "missing.png"))
            still = Path(folder) / "still.jpg"
            Image.new("RGB", (32, 32), (90, 40, 10)).save(still, quality=90)
            self.assertTrue(film.valid_still(still))
            still.write_bytes(still.read_bytes()[: still.stat().st_size // 2])
            self.assertFalse(film.valid_still(still))
            self.assertFalse(film.valid_still(Path(folder) / "missing.jpg"))
            film.archive(bad)
            self.assertFalse(bad.exists())
            self.assertEqual(len(list((Path(folder) / "archive").glob("bad_*.png"))), 1)


class ContactTests(unittest.TestCase):
    def test_pilot_contact_from_synthetic_endpoints(self):
        with tempfile.TemporaryDirectory() as folder:
            config, _ = tiny_config(folder)
            run = Path(folder) / "run"
            for mode in film.MODES:
                for frame in common.expected(config, "pilot"):
                    write_frame(film.frame_path(run, "pilot", mode, frame), frame, mode)
            sheet = film.contact(config, run, "pilot")
            self.assertEqual(sheet, run / "Pilot Contact.jpg")
            with Image.open(sheet) as image:
                self.assertEqual(image.size, (1600, 640))
            # Idempotent: a second call keeps the existing sheet.
            self.assertEqual(film.contact(config, run, "pilot"), sheet)

    def test_final_contact_from_review_stills(self):
        with tempfile.TemporaryDirectory() as folder:
            config, _ = tiny_config(folder, shots=[helpers.shot(str(i)) for i in range(5)])
            run = Path(folder) / "run"
            (run / "review").mkdir(parents=True)
            for index in range(5):
                still = run / "review" / f"{index + 1:02d}.jpg"
                Image.new("RGB", (80, 88), (index * 40, 90, 120)).save(still)
            sheet = film.contact(config, run, "final")
            self.assertEqual(sheet, run / "review" / "Final Contact.jpg")
            with Image.open(sheet) as image:
                self.assertEqual(image.size, (1600, 1280))

    def test_tile_grid(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = []
            for index in range(10):
                path = Path(folder) / f"{index:04d}.jpg"
                Image.new("RGB", (80, 88), (index * 20, 50, 50)).save(path)
                paths.append(path)
            font = film.load_font({}, 14)
            three = film.tile(paths[:3], 8, ["a", "b", "c"], font)
            self.assertEqual(three.size, (240, 112))
            ten = film.tile(paths, 8, [str(i) for i in range(10)], font)
            self.assertEqual(ten.size, (640, 224))
            large = film.tile(paths[:1], 8, ["x"], font, max_width=40)
            self.assertEqual(large.size, (40, 44 + 24))


@unittest.skipUnless(HAS_FFMPEG, "ffmpeg and ffprobe are required")
class AssembleTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.config, self.config_path = tiny_config(self.folder.name)
        self.run = common.run_directory(self.config)
        for mode in film.MODES:
            for frame in common.expected(self.config, "run"):
                write_frame(film.frame_path(self.run, "run", mode, frame), frame, mode)

    def tearDown(self):
        self.folder.cleanup()

    def test_assemble_end_to_end(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            report = film.main([str(self.config_path), "assemble"])
        self.assertEqual(report["stage"], "encoded")
        self.assertEqual(json.loads(out.getvalue().strip().splitlines()[-1]), report)
        verification = json.loads((self.run / "verification.json").read_text())
        self.assertEqual(verification["final_frames"], 36)
        self.assertEqual(len(verification["outputs"]), 4)
        sizes = {}
        for output in verification["outputs"]:
            path = Path(output["path"])
            self.assertTrue(path.is_file(), path)
            self.assertEqual(film.frame_count(self.config, path), 36, path)
            self.assertEqual(output["frames"], 36)
            sizes[path.name] = (output["width"], output["height"])
        self.assertEqual(sizes["PATINA Comparison.mp4"], (80, 88))
        self.assertEqual(sizes["PATINA Comparison Share.mp4"], (80, 88))
        self.assertEqual(sizes["Original Matched Camera.mp4"], PANEL)
        self.assertEqual(sizes["Patina Matched Camera.mp4"], PANEL)
        for index in range(2):
            clip = self.run / "clips" / f"patina_{index:02d}.mp4"
            self.assertEqual(film.frame_count(self.config, clip), 24)
        stills = [Path(p) for p in verification["review_stills"]]
        self.assertEqual([p.name for p in stills], ["01.jpg", "02.jpg"])
        for still in stills:
            with Image.open(still) as image:
                self.assertEqual(image.size, (80, 88))
        final_contact = Path(verification["final_contact"])
        self.assertEqual(final_contact, self.run / "review" / "Final Contact.jpg")
        with Image.open(verification["final_contact"]) as image:
            self.assertEqual(image.size, (1600, 640))
        sweep = Path(verification["sweep_contact"])
        self.assertEqual(sweep, self.run / "review" / "Sweep Contact.jpg")
        frames = sorted((self.run / "review" / "sweep").glob("*.jpg"))
        self.assertEqual(verification["sweep_frames"], len(frames))
        self.assertEqual(verification["sweep_fps"], 2)
        # 1.5 seconds sampled at 2 fps: three samples, four if ffmpeg pads the tail.
        self.assertIn(len(frames), (3, 4))
        with Image.open(sweep) as image:
            columns = min(8, len(frames))
            rows = math.ceil(len(frames) / columns)
            self.assertEqual(image.size, (columns * 80, rows * (88 + 24)))
        self.assertTrue((self.run / "Layout.png").is_file())
        self.assertTrue((self.run / "status.json").is_file())

    def test_assemble_resumes_without_re_encoding(self):
        with contextlib.redirect_stdout(io.StringIO()):
            film.main([str(self.config_path), "assemble"])
            before = {p: p.stat().st_mtime_ns for p in self.run.glob("*.mp4")}
            film.main([str(self.config_path), "assemble"])
        self.assertEqual(len(before), 4)
        self.assertEqual(before, {p: p.stat().st_mtime_ns for p in self.run.glob("*.mp4")})

    def test_incomplete_encode_is_archived_and_redone(self):
        stale = self.run / "Original Matched Camera.mp4"
        stale.write_bytes(b"truncated")
        with contextlib.redirect_stdout(io.StringIO()):
            film.main([str(self.config_path), "assemble"])
        self.assertEqual(film.frame_count(self.config, stale), 36)
        archived = list((self.run / "archive").glob("Original Matched Camera_*.mp4"))
        self.assertEqual(len(archived), 1)

    def assemble(self):
        with contextlib.redirect_stdout(io.StringIO()):
            film.main([str(self.config_path), "assemble"])
        return json.loads((self.run / "verification.json").read_text())

    def truncate(self, path):
        path.write_bytes(path.read_bytes()[: path.stat().st_size // 2])

    def test_partial_sweep_folder_is_not_trusted(self):
        sweep = self.run / "review" / "sweep"
        sweep.mkdir(parents=True)
        for index in (1, 2):
            Image.new("RGB", PANEL, (index, 0, 0)).save(sweep / f"{index:04d}.jpg")
        verification = self.assemble()
        self.assertIn(verification["sweep_frames"], (3, 4))
        with Image.open(verification["sweep_contact"]) as image:
            self.assertEqual(image.width, verification["sweep_frames"] * 80)
        self.assertFalse((self.run / "review" / "archive").exists())

    def test_truncated_sweep_frame_rebuilds_the_sheet(self):
        first = self.assemble()
        frame = self.run / "review" / "sweep" / "0001.jpg"
        self.truncate(frame)
        sheet = Path(first["sweep_contact"])
        stamp = sheet.stat().st_mtime_ns
        second = self.assemble()
        self.assertEqual(second["sweep_frames"], first["sweep_frames"])
        self.assertTrue(film.valid_still(frame))
        self.assertNotEqual(sheet.stat().st_mtime_ns, stamp)
        archived = list((self.run / "review" / "archive").glob("Sweep Contact_*.jpg"))
        self.assertEqual(len(archived), 1)

    def test_truncated_review_still_is_archived_and_the_sheet_redone(self):
        self.assemble()
        still = self.run / "review" / "02.jpg"
        self.truncate(still)
        self.assertFalse(film.valid_still(still))
        self.assemble()
        self.assertTrue(film.valid_still(still))
        archive = self.run / "review" / "archive"
        self.assertEqual(len(list(archive.glob("02_*.jpg"))), 1)
        self.assertEqual(len(list(archive.glob("Final Contact_*.jpg"))), 1)
        self.assertEqual(len(list(archive.glob("01_*.jpg"))), 0)

    def test_missing_source_frame_fails_loudly(self):
        film.frame_path(self.run, "run", "patina", 47).unlink()
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError):
                film.main([str(self.config_path), "assemble"])


if __name__ == "__main__":
    unittest.main()
