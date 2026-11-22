"""End-to-end runs of the shipped scripts on tiny generated clips (need ffmpeg)."""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

import helpers

LOOKS = {
    "_readme": "notes are skipped",
    "00_ungraded": {"name": "Ungraded", "ops": []},
    "01_warm": {"name": "Warm", "settings": "warmth +20", "ops": [{"op": "white_balance", "temp": 0.2}],
                "vignette": "PI/5", "grain": 4, "halation": {"threshold": 0.6}},
    "02_relit": {"name": "Relit", "relight": [{"op": "spotlight", "strength": 0.5, "outside": -0.5,
                                               "keys": [[0, 0.3, 0.5], [1, 0.7, 0.5]]}], "ops": []},
    "03_masked": {"name": "Masked", "selective": {"masks": [{"path": "masks/box.mp4"}]}, "ops": []},
    "04_keyed": {"name": "Keyed", "selective": {"center": 0, "width": 30, "min_sat": 0.3, "min_area": 0.01},
                 "ops": [{"op": "contrast", "amount": 0.3}]},
    "05_match": {"name": "Match", "ops": [{"op": "match", "stats": "match/reference.json"}]},
}


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class ScriptTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        helpers.make_clip(self.dir / "clip.mp4")
        (self.dir / "looks.json").write_text(json.dumps(LOOKS))
        (self.dir / "masks").mkdir()
        helpers.make_mask(self.dir / "masks/box.mp4")

    def run_ok(self, script, *args):
        result = helpers.run(script, *args, cwd=self.dir)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_probe_reads_size_frames_rate_and_audio(self):
        info = helpers.load("media").probe(self.dir / "clip.mp4")
        self.assertEqual((info["w"], info["h"], info["frames"], info["fps"], info["audio"]), (96, 54, 24, 24.0, True))

    def test_still_test_writes_every_look_and_a_grid(self):
        out = self.run_ok("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "still", "--frame", "5")
        self.assertIn("skipping 05_match", out)
        names = sorted(p.name for p in (self.dir / "still").glob("*.png"))
        self.assertEqual(names, ["00_source.png", "00_ungraded.png", "01_warm.png", "02_relit.png", "03_masked.png",
                                 "04_keyed.png"])
        self.assertTrue((self.dir / "still/grid.jpg").exists())
        self.assertTrue((self.dir / "still/luts/01_warm.cube").exists())
        masked = np.asarray(Image.open(self.dir / "still/03_masked.png").convert("RGB")).astype(int)
        corner = masked[2, 2]
        self.assertLessEqual(corner.max() - corner.min(), 2)  # outside the mask: black and white

    def test_grain_leaves_black_and_white_gray(self):
        looks = {"bw": {"name": "BW", "ops": [{"op": "mono"}], "grain": 10}}
        (self.dir / "bw.json").write_text(json.dumps(looks))
        self.run_ok("render_looks.py", "clip.mp4", "--looks", "bw.json", "--out", "s", "--frame", "3")
        px = np.asarray(Image.open(self.dir / "s/bw.png").convert("RGB")).astype(int)
        self.assertLessEqual((px.max(2) - px.min(2)).max(), 3)

    def test_video_render_keeps_frame_count_and_audio(self):
        Image.new("RGB", (40, 30), (230, 140, 60)).save(self.dir / "ref.png")
        self.run_ok("match.py", "clip.mp4", "ref.png", "match/reference.json")
        out = self.run_ok("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "renders")
        self.assertNotIn("skipping", out)
        for key in LOOKS:
            if key.startswith("_"):
                continue
            path = self.dir / f"renders/{key}.mp4"
            self.assertEqual(helpers.frame_count(path), 24, key)
            self.assertTrue(helpers.load("media").probe(path)["audio"], key)
        self.assertEqual(len(list((self.dir / "renders/luts").glob("*.cube"))), 6)

    def test_render_skips_a_look_whose_mask_is_missing(self):
        (self.dir / "masks/box.mp4").unlink()
        out = self.run_ok("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "r", "--only",
                          "00_ungraded,03_masked")
        self.assertIn("skipping 03_masked: mask masks/box.mp4 not found", out)
        self.assertEqual([p.name for p in (self.dir / "r").glob("*.mp4")], ["00_ungraded.mp4"])

    def test_render_skips_a_look_whose_mask_has_another_length(self):
        helpers.make_mask(self.dir / "masks/box.mp4", seconds=0.5)
        out = self.run_ok("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "r", "--only",
                          "00_ungraded,03_masked")
        self.assertIn("skipping 03_masked: mask masks/box.mp4 has 12 frames, the source 24", out)
        self.assertEqual([p.name for p in (self.dir / "r").glob("*.mp4")], ["00_ungraded.mp4"])

    def test_outputs_are_never_overwritten_without_force(self):
        self.run_ok("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "r", "--only", "00_ungraded")
        again = helpers.run("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "r", cwd=self.dir)
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("--force", again.stderr)
        self.run_ok("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "r", "--only", "00_ungraded",
                    "--force")

    def test_match_measures_both_images(self):
        Image.new("RGB", (40, 30), (230, 140, 60)).save(self.dir / "ref.png")
        self.run_ok("match.py", "clip.mp4", "ref.png", "match/reference.json", "--crop", "20:20:0:0")
        stats = json.loads((self.dir / "match/reference.json").read_text())
        self.assertEqual(stats["reference"], "ref.png")
        self.assertGreater(stats["ref_mean"][2], 30)  # orange: strongly yellow in Lab b
        self.assertLess(stats["ref_std"][0], 1)  # one flat color
        self.assertNotEqual(helpers.run("match.py", "clip.mp4", "ref.png", "match/reference.json",
                                        cwd=self.dir).returncode, 0)

    def test_inspect_grid_sample_and_key(self):
        self.run_ok("inspect_frame.py", "grid", "clip.mp4", "grid.jpg", "--frame", "3", "--step", "20")
        out = self.run_ok("inspect_frame.py", "sample", "clip.mp4", "--frame", "3", "0,0,20,20:corner")
        self.assertRegex(out, r"corner\s+hue p10/50/90")
        out = self.run_ok("inspect_frame.py", "key", "clip.mp4", "looks.json", "04_keyed", "key.jpg",
                          "--frame", "1", "12")
        self.assertIn("frame 12: blobs", out)
        with Image.open(self.dir / "key.jpg") as sheet:
            self.assertEqual(sheet.size, (960, 1080))
        out = self.run_ok("inspect_frame.py", "key", "clip.mp4", "looks.json", "03_masked", "mask.jpg", "--frame", "4")
        self.assertRegex(out, r"frame 4: the masks keep \d+\.\d% of the frame")
        with Image.open(self.dir / "mask.jpg") as sheet:
            px = np.asarray(sheet.convert("RGB")).astype(int)
        self.assertLessEqual((px[:40, -200:].max(2) - px[:40, -200:].min(2)).max(), 6)  # outside the mask: gray

    def reel(self, *extra):
        self.run_ok("render_looks.py", "clip.mp4", "--looks", "looks.json", "--out", "renders",
                    "--only", "00_ungraded,01_warm,02_relit")
        return self.run_ok("showreel.py", "--renders", "renders", "--looks", "looks.json", "--out", "reel.mp4",
                           "--size", "320x180", "--intro", "1", "--seg", "1", "--grid", "1", "--end", "1", *extra)

    def test_showreel_plays_every_look_then_the_grid_unbranded(self):
        helpers.make_clip(self.dir / "music.m4a", seconds=1)
        out = self.reel("--music", "music.m4a")
        self.assertIn("look 2/2 Relit", out)
        reel = self.dir / "reel.mp4"
        self.assertEqual(helpers.frame_count(reel), 24 * 4)  # intro, two looks, grid: no end card
        info = helpers.load("media").probe(reel)
        self.assertEqual((info["w"], info["h"], info["audio"]), (320, 180, True))

    def test_showreel_end_card_only_with_the_users_credit(self):
        self.reel("--credit", "Made by Test Studio")
        self.assertEqual(helpers.frame_count(self.dir / "reel.mp4"), 24 * 5)


if __name__ == "__main__":
    unittest.main()
