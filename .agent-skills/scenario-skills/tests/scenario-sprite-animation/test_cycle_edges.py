"""Edge cases and CLI entry points of the cycle scripts and the grid template builder."""
import contextlib
import importlib.util
import io
import json
import math
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import unittest.mock as mock

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[2] / "skills/scenario-sprite-animation/scripts"
MAGENTA = (255, 0, 255)
HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def load(name):
    # a fresh module per call: cycle_sheets.main rewrites module globals (CANVAS, FRAMES, KEY)
    spec = importlib.util.spec_from_file_location(f"edge_{name}", SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


frames = load("cycle_frames")
prompts = load("cycle_prompts")


def run_main(mod, *argv):
    """Call mod.main() with argv; returns its stdout."""
    buf = io.StringIO()
    with mock.patch.object(sys, "argv", [mod.__file__, *map(str, argv)]), contextlib.redirect_stdout(buf):
        mod.main()
    return buf.getvalue()


def cli(script, *argv):
    """Run a script as its users do; returns its stdout after checking it exited 0."""
    r = subprocess.run([sys.executable, "-B", str(SCRIPTS / script), *map(str, argv)], capture_output=True, text=True)
    if r.returncode:
        raise AssertionError(r.stderr)
    return r.stdout


def figure(w=20, h=40, color=(200, 200, 210)):
    im = np.zeros((h + 8, w + 8, 4), np.uint8)
    im[4:4 + h, 4:4 + w] = (*color, 255)
    return Image.fromarray(im)


def encode(path, seq, fps=24):
    h, w = seq[0].shape[:2]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
                    "-r", str(fps), "-i", "-", "-pix_fmt", "yuv444p", "-crf", "8", str(path)],
                   input=bytes(np.stack(seq)), check=True)


def sliding_walk(n=60, size=240):
    """A figure that slides across the frame instead of cycling: no frame pair closes a loop."""
    seq = []
    for i in range(n):
        a = np.zeros((size, size, 3), np.uint8)
        a[:] = MAGENTA
        x = size // 12 + i * size // 120
        a[size // 4:size * 5 // 6, x:x + size // 6] = (180, 170, 150)
        seq.append(a)
    return seq


def throw(n=30, size=240):
    """Rest, an arm out with a projectile flying off it, rest."""
    seq = []
    u = size // 240
    for i in range(n):
        a = np.zeros((size, size, 3), np.uint8)
        a[:] = MAGENTA
        a[60 * u:200 * u, 100 * u:140 * u] = (40, 90, 160)
        if 10 <= i <= 18:
            a[100 * u:110 * u, 140 * u:190 * u] = (40, 90, 160)
            x = (200 + 3 * (i - 10)) * u
            a[100 * u:112 * u, x:x + 12 * u] = (200, 60, 60)
        seq.append(a)
    return seq


class FirstFrameEdgeTests(unittest.TestCase):
    def test_key_check_ignores_a_figure_thinner_than_its_backdrop_rim(self):
        a = np.full((200, 200, 3), 255, np.uint8)
        a[20:180, 100] = (230, 30, 220)                        # one magenta pixel wide: all rim
        im = Image.fromarray(a)
        fg, near = frames.foreground(im)
        self.assertTrue(fg[100, 100])
        self.assertEqual(frames.key_check(im.convert("RGBA"), fg, near), {"magenta": 0.0, "green": 0.0, "blue": 0.0})

    def test_nearest_scale_steps_down_until_a_wide_figure_fits(self):
        fig = Image.new("RGBA", (300, 40), (90, 90, 90, 255))
        mask = Image.new("L", (300, 40), 255)
        out, note = frames.place(fig, mask, 960, 0.58, 0.82, "magenta", True)
        self.assertEqual(note, "x3 nearest")                  # x14 would reach the height, x3 is the widest fit
        ys, xs = np.where((np.array(out) != MAGENTA).any(-1))
        self.assertEqual((xs.max() - xs.min() + 1, ys.max() - ys.min() + 1), (900, 120))
        self.assertEqual(ys.max() + 1, int(960 * 0.82))

    def test_smooth_figure_wider_than_the_canvas_is_refused(self):
        fig = Image.new("RGBA", (400, 100), (90, 90, 90, 255))
        with self.assertRaisesRegex(ValueError, "lower --fig"):
            frames.place(fig, Image.new("L", (400, 100), 255), 960, 0.58, 0.82, "magenta", False)

    def test_extra_figures_merge_across_the_narrowest_gap(self):
        fg = np.zeros((60, 300), bool)
        for x0, x1 in ((10, 50), (60, 100), (200, 240)):
            fg[10:50, x0:x1] = True
        self.assertEqual(frames.figure_spans(fg, 2), [(10, 100), (200, 240)])

    def test_flip_mirrors_before_placing(self):
        im = np.zeros((48, 28, 4), np.uint8)
        im[4:44, 4:24] = (200, 200, 210, 255)
        im[4:12, 4:10] = (20, 120, 40, 255)                     # a green patch on the figure's left
        art = Image.fromarray(im)
        for flip, side in ((False, -1), (True, 1)):
            out, _, _ = frames.first_frames(art, ["e"], canvas=480, flip=flip)
            ys, xs = np.where((np.array(out["e"]) == (20, 120, 40)).all(-1))
            self.assertEqual(np.sign(xs.mean() - 240), side, flip)

    def test_an_equal_column_without_a_figure_is_an_error(self):
        sheet = Image.new("RGB", (200, 100), MAGENTA)
        sheet.paste(figure().convert("RGB"), (20, 20), figure())
        with self.assertRaisesRegex(ValueError, "ne: no figure found in columns 100-200"):
            with contextlib.redirect_stdout(io.StringIO()) as buf:
                frames.first_frames(sheet, ["se", "ne"])
        self.assertIn("WARNING: found 1 separate figures for 2 facings; splitting into equal columns", buf.getvalue())


class FirstFrameCliTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def test_sheet_writes_one_frame_per_facing_and_reports_the_key_check(self):
        sheet = Image.new("RGB", (400, 200), MAGENTA)
        sheet.paste(figure().convert("RGB"), (60, 60), figure())
        sheet.paste(figure(color=(50, 90, 200)).convert("RGB"), (260, 60), figure())
        sheet.save(self.dir / "sheet.png")
        out = run_main(frames, "kn", self.dir / "sheet.png", "--out", self.dir / "f", "--canvas", 240, "--smooth")
        self.assertIn("key check, share of the figure each key would erase: magenta 0.0%", out)
        self.assertNotIn("WARNING", out)
        for facing in ("se", "ne"):
            path = self.dir / "f" / f"kn_{facing}_first.png"
            self.assertIn(f"{path} smooth", out)
            with Image.open(path) as im:
                self.assertEqual(im.size, (240, 240))

    def test_a_key_colored_character_gets_the_safest_key_suggested(self):
        figure(color=(230, 30, 220)).save(self.dir / "pink.png")
        out = cli("cycle_frames.py", "p", self.dir / "pink.png", "--facing", "e", "--flip", "--nearest",
                       "--out", self.dir / "f", "--canvas", 240, "--key", "magenta")
        self.assertIn("WARNING: --key magenta would erase", out)
        self.assertIn("re-run with --key green", out)
        self.assertIn("x3 nearest, native height 40 px, 1 colors", out)
        self.assertTrue((self.dir / "f" / "p_e_first.png").is_file())


class PromptEdgeTests(unittest.TestCase):
    def test_a_text_hero_needs_a_character_description(self):
        with self.assertRaisesRegex(ValueError, "k: needs a 'character' description"):
            prompts.build({"heroes": {"k": {"who": "knight"}}})

    def test_a_single_facing_gets_a_one_pose_square_still(self):
        out = prompts.build({"facings": ["e"], "heroes": {"k": {"character": "a knight"}}})
        (still,) = out["stills"]
        self.assertEqual((still["width"], still["height"], still["split"]), (1024, 1024, ["e"]))
        self.assertIn("one pose of the character", still["prompt"])
        self.assertIn("Pose: full side profile facing right.", still["prompt"])

    def test_three_facings_get_a_numbered_wide_sheet(self):
        out = prompts.build({"facings": ["s", "e", "n"], "heroes": {"k": {"character": "a knight"}}})
        (still,) = out["stills"]
        self.assertEqual(still["width"], 512 * 4)
        self.assertIn("3 poses of the same character side by side", still["prompt"])
        self.assertIn("2. full side profile facing right", still["prompt"])

    def test_an_unknown_cycle_is_refused(self):
        with self.assertRaisesRegex(ValueError, "no prompt template for cycle 'swim'"):
            prompts.build({"cycles": ["walk", "swim"], "heroes": {"k": {"character": "a knight"}}})

    def test_cli_writes_the_requests_and_prints_the_mirror_notes(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "cast.json").write_text(json.dumps({"heroes": {"k": {"character": "a knight"}}}), encoding="utf-8")
            out = cli("cycle_prompts.py", tmp / "cast.json", "-o", tmp / "req.json")
            req = json.loads((tmp / "req.json").read_text(encoding="utf-8"))
        self.assertEqual(len(req["clips"]), 8)                  # 2 facings x 4 cycles
        self.assertIn(f"1 stills, 8 clips (7 short, 1 long) -> {tmp / 'req.json'}", out)
        self.assertIn("note: SW is a mirror of SE", out)
        self.assertIn("note: NW is a mirror of NE", out)


class SheetPickEdgeTests(unittest.TestCase):
    def setUp(self):
        self.sheets = load("cycle_sheets")

    def pick(self, *args, **kw):
        with contextlib.redirect_stdout(io.StringIO()) as buf:
            result = self.sheets.pick(*args, **kw)
        return result, buf.getvalue()

    def test_attack_samples_the_active_window_and_can_drop_the_projectile(self):
        (kept, info), _ = self.pick("t_e_attack", "attack", throw())
        self.assertEqual((info["mode"], info["start"], info["length"]), ("active-window", 8, 13))
        self.assertEqual(info["fps"], 12.0)                     # 8 frames over 13 at 24 fps, capped
        self.assertNotIn("size_vs_first_frame", info)
        self.assertTrue(any(k[100:112, 195:, 3].any() for k in kept))
        (kept, _), _ = self.pick("t_e_attack", "attack", throw(), attack_body_only=True)
        self.assertFalse(any(k[100:112, 195:, 3].any() for k in kept))
        self.assertTrue(all(k[60:200, 100:140, 3].all() for k in kept))

    def test_motion_below_the_floor_relaxes_the_search(self):
        seq = []
        for i in range(72):
            a = np.zeros((240, 240, 3), np.uint8)
            a[:] = MAGENTA
            a[60:200, 100:140] = (180, 170, 150)
            x = int(130 + np.cos(2 * np.pi * i / 16))
            a[100:102, x:x + 1] = (20, 20, 20)                  # a one-pixel twitch, lost in the motion probe
            seq.append(a)
        (_, info), out = self.pick("t_e_walk", "walk", seq)
        self.assertIn("t_e_walk: little motion or short clip for a walk loop; relaxed the search", out)
        self.assertEqual(info["mode"], "loop")
        self.assertTrue(12 <= info["length"] <= 34)
        self.assertEqual(info["size_vs_first_frame"], 1.0)

    def test_a_frozen_clip_gets_a_finite_seam_score(self):
        still = np.zeros((240, 240, 3), np.uint8)
        still[:] = MAGENTA
        still[60:200, 100:140] = (180, 170, 150)
        with np.errstate(invalid="raise"):
            (_, info), out = self.pick("t_e_walk", "walk", [still] * 40)
        self.assertTrue(math.isfinite(info["seam_over_baseline"]))
        self.assertGreater(info["seam_over_baseline"], 0.8)      # the sheet summary flags it as a weak seam
        self.assertEqual(info["baseline"], 0.0)
        self.assertIn("t_e_walk: no motion in the walk clip (the video model returned a still); regenerate", out)

    def test_a_frozen_stretch_never_beats_a_moving_window(self):
        moving = [(np.zeros((4, 4, 3)), np.full((4, 4), float(i % 2))) for i in range(12)]
        frozen = [(np.zeros((4, 4, 3)), np.zeros((4, 4)))] * 12
        score, s, P, seam, base = self.sheets.loop_window(frozen + moving, 2, 4, first=0, min_base=0)
        self.assertGreater(base, 0)
        self.assertTrue(math.isfinite(score))

    def test_a_clip_too_short_for_any_loop_stops(self):
        with self.assertRaisesRegex(SystemExit, r"t_e_walk: clip too short to find a walk loop \(8 frames\)"):
            self.pick("t_e_walk", "walk", sliding_walk(8))

    def test_hd_finish_keeps_the_soft_alpha(self):
        rgb = np.full((2, 2, 3), 90, np.uint8)
        out = self.sheets.apply_hd(rgb, np.array([[0.0, 0.25], [0.5, 1.2]]))
        self.assertEqual(out[..., 3].tolist(), [[0, 63], [127, 255]])
        np.testing.assert_array_equal(out[..., :3], rgb)

    def test_missing_clips_skip_the_cycle_and_keep_the_old_meta(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "clips").mkdir()
            (tmp / "sheets").mkdir()
            (tmp / "sheets/meta.json").write_text('{"old": {}}', encoding="utf-8")
            (tmp / "cast.json").write_text(json.dumps({"cycles": ["walk"], "heroes": {"t": {}}}), encoding="utf-8")
            out = run_main(self.sheets, tmp / "cast.json", "--clips", tmp / "clips", "--out", tmp / "sheets")
            self.assertEqual(out, "skip t walk: missing t_se_walk.mp4, t_ne_walk.mp4\n")
            self.assertEqual(sorted(p.name for p in (tmp / "sheets").iterdir()), ["meta.json"])
            self.assertEqual((tmp / "sheets/meta.json").read_text(encoding="utf-8"), '{"old": {}}')


@unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg and ffprobe")
class SheetClipTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.sheets = load("cycle_sheets")

    def test_a_wide_clip_is_padded_square_with_the_feet_on_the_bottom(self):
        a = np.zeros((240, 320, 3), np.uint8)
        a[:] = MAGENTA
        a[120:240, 140:180] = (40, 90, 160)                      # feet on the bottom edge
        encode(self.dir / "wide.mp4", [a] * 3)
        arr, fps = self.sheets.read_frames(self.dir / "wide.mp4")
        self.assertEqual((arr.shape, fps), ((3, 960, 960, 3), 24.0))
        alpha = self.sheets.key(arr[0])[..., 3]
        ys, xs = np.where(alpha > 0)
        self.assertEqual(alpha[:240].max(), 0)                   # the key-color band above the clip
        self.assertGreaterEqual(ys.max(), 955)
        self.assertLessEqual(abs(ys.min() - 600), 4)
        self.assertLessEqual(abs(xs.min() - 420), 4)
        self.assertLessEqual(abs(xs.max() - 539), 4)

    def test_hd_hero_sheet_with_frames_dir_and_a_weak_seam_warning(self):
        clips = self.dir / "clips"
        clips.mkdir()
        encode(clips / "t_e_walk.mp4", sliding_walk(60, 480))
        encode(clips / "t_e_attack.mp4", throw(30, 480))
        cast = {"canvas": 480, "facings": ["e"], "cycles": ["walk", "attack"], "fig_frac": 0.5,
                "heroes": {"t": {"height": 32, "pixel": False, "attack_body_only": True}}}
        (self.dir / "cast.json").write_text(json.dumps(cast), encoding="utf-8")
        out = run_main(self.sheets, self.dir / "cast.json", "--clips", clips, "--out", self.dir / "sheets",
                       "--frames-dir", self.dir / "cells")
        self.assertRegex(out, r"t_e_walk .* <-- weak seam")
        self.assertNotRegex(out, r"t_e_attack .* <-- weak seam")
        meta = json.loads((self.dir / "sheets/meta.json").read_text(encoding="utf-8"))["t"]
        self.assertIsNone(meta["palette"])
        self.assertEqual(meta["scale"], round(32 / 240, 4))
        self.assertEqual(meta["rows"], ["e", "w"])
        cw, ch = meta["cell"]
        for cycle in ("walk", "attack"):
            names = sorted(p.name for p in (self.dir / "cells/t" / cycle).iterdir())
            self.assertEqual(names, sorted(f"{r}_{k}.png" for r in ("e", "w") for k in range(8)))
            with Image.open(self.dir / f"sheets/t_{cycle}.png") as im:
                alpha = np.array(im)[..., 3]
            self.assertEqual(alpha.shape, (ch * 2, cw * 8))
            self.assertTrue(((alpha > 0) & (alpha < 255)).any(), cycle)  # soft HD edges, no hard palette mask
        with Image.open(self.dir / "cells/t/attack/e_4.png") as im:
            self.assertEqual(im.size, (cw, ch))


class GridTemplateCliTests(unittest.TestCase):
    def test_an_unknown_role_is_refused(self):
        grids = load("build_grid_templates")
        template = json.loads(grids.MANIFEST.read_text(encoding="utf-8"))["templates"][0]
        with self.assertRaisesRegex(ValueError, "Unknown role: mask"):
            grids.render(template, "mask")

    def test_cli_writes_one_template_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([sys.executable, str(SCRIPTS / "build_grid_templates.py"), str(Path(tmp) / "out"),
                                "--template", "sprite-grid-4x4-v1"], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            manifest = json.loads((Path(tmp) / "out/manifest.json").read_text(encoding="utf-8"))
            self.assertEqual([t["name"] for t in manifest["templates"]], ["sprite-grid-4x4-v1"])
            for entry in manifest["templates"][0]["files"].values():
                self.assertNotIn("asset_id", entry)
                self.assertTrue((Path(tmp) / "out" / entry["file"]).is_file())


if __name__ == "__main__":
    unittest.main()
