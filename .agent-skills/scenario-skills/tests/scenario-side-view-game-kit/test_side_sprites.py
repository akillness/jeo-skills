import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

sys.path.insert(0, str(synth.SCRIPTS))
import side_sprites as ss  # noqa: E402
import sprite_cycles as sc  # noqa: E402

import numpy as np  # noqa: E402


class ParseTests(unittest.TestCase):
    def test_cycles(self):
        self.assertEqual(ss.parse_cycles("run:loop:8, atk1:attack:7,"), {"run": ("loop", 8), "atk1": ("attack", 7)})
        for bad in ("run:loop", "run:spin:8", "run:loop:1", "run:loop:x", " , "):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                ss.parse_cycles(bad)

    def test_unknown_loop_cycle_needs_a_range(self):
        cycles = ss.parse_cycles("swim:loop:8,lunge:attack:6")
        with self.assertRaises(SystemExit) as cm:
            ss.parse_ranges(None, cycles)
        self.assertIn("--range swim=MIN:MAX", str(cm.exception))
        self.assertEqual(ss.parse_ranges(["swim=6:20"], cycles)["swim"], (6, 20))

    def test_ranges_errors(self):
        cycles = ss.parse_cycles("run:loop:8")
        for bad in ("run", "run=8", "run=1:8", "run=9:8", "run=a:9"):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                ss.parse_ranges([bad], cycles)

    def test_drops(self):
        self.assertEqual(ss.parse_drops(["atk1=2,0", "atk1=5", "hurt=1"]), {"atk1": {0, 2, 5}, "hurt": {1}})
        for bad in ("atk1", "atk1=", "atk1=x", "atk1=-1"):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                ss.parse_drops([bad])


class KeyTests(unittest.TestCase):
    def test_magenta_shadow_and_haze_go_figure_colors_stay(self):
        background = [(255, 0, 255), (120, 40, 140), (230, 120, 220)]  # key, purple ground shadow, pink haze
        figure = [(40, 90, 200), (230, 200, 160), (60, 160, 60), (230, 230, 230), (20, 20, 30)]
        rgba = sc.key(np.array([background + figure], np.uint8))
        self.assertEqual(rgba[0, :3, 3].tolist(), [0, 0, 0])
        self.assertEqual(rgba[0, 3:, 3].tolist(), [255] * len(figure))


class SplitPosesTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        self.sheet = Path(tmp) / "poses.png"
        synth.pose_sheet(self.sheet)

    def test_components_survive_overlapping_columns(self):
        figs = ss.split_poses(synth.load(self.sheet), 2)
        self.assertEqual([f.shape[:2] for f in figs], [(40, 60), (50, 40)])  # left to right
        self.assertTrue((figs[0][..., 3] == 255).all())

    def test_too_few_figures(self):
        with self.assertRaises(SystemExit):
            ss.split_poses(synth.load(self.sheet), 3)


@unittest.skipUnless(synth.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class EndToEndTests(unittest.TestCase):
    CYCLES = "run:loop:6,attack:attack:5"

    @classmethod
    def setUpClass(cls):
        cls.dir = Path(tempfile.mkdtemp())
        cls.addClassCleanup(shutil.rmtree, cls.dir)
        cls.clips = cls.dir / "clips"
        cls.clips.mkdir()
        synth.clip(cls.clips / "hero_run.mp4", "loop")
        synth.clip(cls.clips / "hero_attack.mp4", "attack", frames=30)
        synth.two_pose(cls.dir / "two_pose.png")
        r = synth.run("reframe_stills.py", cls.dir / "two_pose.png", "--name", "hero", "--out", cls.dir, "--size", 96)
        assert r.returncode == 0, r.stderr
        cls.out = cls.dir / "sprites"
        cls.first = cls.sprites(cls.out, "--jump", cls.dir / "hero_action.png")

    @classmethod
    def sprites(cls, out, *extra):
        return synth.run("side_sprites.py", "--clips", cls.clips, "--name", "hero", "--cycles", cls.CYCLES,
                         "--canvas", 96, "--height", 24, "--palette", 8, "--out", out, *extra)

    def test_strips_share_one_cell_and_anchor(self):
        self.assertEqual(self.first.returncode, 0, self.first.stderr)
        meta = json.loads((self.out / "hero_meta.json").read_text())
        cw, ch = meta["cell"]
        self.assertEqual(meta["anchor"], [cw // 2, round((int(96 * 0.82) - meta["box"][1]) * meta["scale"])])
        self.assertLessEqual(meta["anchor"][1], ch)
        for cycle, frames in (("run", 6), ("attack", 5)):
            self.assertEqual(synth.size(self.out / f"hero_{cycle}.png"), (cw * frames, ch), cycle)
            self.assertEqual(meta["cycles"][cycle]["frames"], frames)
        self.assertEqual(meta["cycles"]["run"]["window"]["mode"], "loop")
        self.assertEqual(meta["cycles"]["run"]["window"]["length"] % 10, 0)  # the clip's 10-frame stride
        self.assertEqual(meta["cycles"]["attack"]["window"]["mode"], "active-window")
        self.assertEqual(list(synth.size(self.out / "hero_pose_jump.png")), meta["poses"]["jump"])

    def test_palette_is_shared(self):
        colors = set()
        for name in ("hero_run.png", "hero_attack.png", "hero_pose_jump.png"):
            im = synth.load(self.out / name).convert("RGBA")
            colors |= {c[:3] for _, c in im.getcolors(1 << 16) if c[3]}
        # 8 palette entries, each possibly darkened once by the outline pass
        self.assertLessEqual(len(colors), 16)

    def test_refuses_to_overwrite(self):
        r = self.sprites(self.out)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("would overwrite", r.stderr)

    def test_report_writes_nothing(self):
        out = self.dir / "report"
        r = self.sprites(out, "--report")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("hero_run: start", r.stdout)
        self.assertIn("seam", r.stdout)
        self.assertFalse(out.exists())

    def test_drop_and_webp(self):
        out = self.dir / "webp"
        r = self.sprites(out, "--drop", "attack=1", "--webp")
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((out / "hero_meta.json").read_text())
        cw, ch = meta["cell"]
        self.assertEqual(meta["cycles"]["attack"]["frames"], 4)
        self.assertEqual(meta["cycles"]["attack"]["window"]["dropped"], [1])
        for cycle, frames in (("run", 6), ("attack", 4)):
            path = out / f"hero_{cycle}.webp"
            self.assertEqual(synth.size(path), (cw * frames, ch))
            self.assertIn(b"VP8L", path.read_bytes()[:64])  # the lossless bitstream
        self.assertFalse(list(out.glob("*.png")))

    def test_poses_join_the_strips(self):
        out = self.dir / "poses"
        synth.pose_sheet(self.dir / "pose_sheet.png")
        r = self.sprites(out, "--poses", self.dir / "pose_sheet.png", "--pose-names", "a,b", "--pose-scale", 0.5)
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((out / "hero_meta.json").read_text())
        for pose in ("a", "b"):
            self.assertEqual(list(synth.size(out / f"hero_pose_{pose}.png")), meta["poses"][pose])
        self.assertEqual(meta["poses"]["a"], [30, 20])  # the wide left figure, at half scale

    def test_mode_not_name_picks_the_window(self):
        clips = self.dir / "named"
        clips.mkdir()
        shutil.copy(self.clips / "hero_run.mp4", clips / "hero_attack.mp4")
        r = synth.run("side_sprites.py", "--clips", clips, "--name", "hero", "--cycles", "attack:loop:6",
                      "--range", "attack=8:24", "--canvas", 96, "--report")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("seam", r.stdout)

    def test_non_square_clip_stops(self):
        clips = self.dir / "wide"
        clips.mkdir()
        synth.clip(clips / "hero_run.mp4", "loop", width=160)
        r = synth.run("side_sprites.py", "--clips", clips, "--name", "hero", "--cycles", "run:loop:6",
                      "--canvas", 96, "--report")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("must be square", r.stderr)

    def test_drop_past_the_strip(self):
        r = self.sprites(self.dir / "past", "--drop", "attack=5")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("past its 5 frames", r.stderr)


if __name__ == "__main__":
    unittest.main()
