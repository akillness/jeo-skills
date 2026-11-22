"""dyn.py and holds.py on lossless synthetic clips: still share, holds, motion, cuts and flips."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

import media

sys.path.insert(0, str(media.SCRIPTS))
import dyn  # noqa: E402
import holds  # noqa: E402


def run(script, *args):
    return subprocess.run([sys.executable, "-I", str(media.SCRIPTS / script), *map(str, args)], capture_output=True, text=True)


def moving_still_moving(fps):
    """0.5 s panning, 1 s still, 0.5 s panning, at fps."""
    tex = media.texture(1400, 360, seed=4, blur=32)
    step = 360 / fps  # px per frame: the same speed in px per second at any rate
    frames, x = [], 0.0
    for i in range(int(2 * fps)):
        t = i / fps
        if not 0.5 <= t < 1.5:
            x += step
        frames.append(tex[:, int(x) : int(x) + 640].copy())
    return frames


def blinking_box(side):
    """A still texture with a side x side px box (at 640 px wide) that flips black and white every frame."""
    tex = media.texture(640, 360, seed=6, blur=32)
    frames = []
    for i in range(60):
        f = tex.copy()
        f[100 : 100 + side, 100 : 100 + side] = 255 if i % 2 else 0
        frames.append(f)
    return frames


class Clips:
    """The clips both suites read, made once per run."""


def setUpModule():
    Clips.tmp = tempfile.TemporaryDirectory()
    d = Path(Clips.tmp.name)
    Clips.dir = d
    tex = media.texture(1400, 360, seed=1, blur=32)  # smooth: a pan changes a fifth of the frame, not a cut
    Clips.static = media.write_video(d / "static.mkv", [tex[:, :640]] * 120, 60)
    Clips.panning = media.write_video(d / "pan.mkv", media.pan(tex, 120, 640, 360, 6), 60)
    Clips.hold30 = media.write_video(d / "hold30.mkv", moving_still_moving(30), 30)
    Clips.hold60 = media.write_video(d / "hold60.mkv", moving_still_moving(60), 60)
    black, white = np.zeros((360, 640, 3), np.uint8), np.full((360, 640, 3), 255, np.uint8)
    Clips.flips = media.write_video(d / "flips.mkv", [black if (i // 30) % 2 == 0 else white for i in range(120)], 60)
    Clips.small_change = media.write_video(d / "small.mkv", blinking_box(40), 60)
    Clips.big_change = media.write_video(d / "big.mkv", blinking_box(80), 60)
    Clips.sound = media.write_wav(d / "sound.wav", media.tone(1.0))


def tearDownModule():
    Clips.tmp.cleanup()


class DynTest(unittest.TestCase, Clips):
    def test_static_clip_is_one_long_hold(self):
        s, _ = dyn.measure(str(self.static))
        self.assertGreaterEqual(s["still_share"], 0.99)
        self.assertAlmostEqual(s["longest_hold_s"], 2.0, delta=1 / 30)
        self.assertLess(s["median_flow"], 0.5)
        self.assertEqual(s["holds_over_0_5s"], 1)

    def test_still_means_under_one_and_a_half_percent_changing(self):
        # a 40 px box is 0.7% of the frame, an 80 px box 2.8%
        self.assertGreaterEqual(dyn.measure(str(self.small_change))[0]["still_share"], 0.99)
        self.assertLessEqual(dyn.measure(str(self.big_change))[0]["still_share"], 0.01)

    def test_panning_clip_moves_every_frame(self):
        s, per_second = dyn.measure(str(self.panning))
        self.assertLessEqual(s["still_share"], 0.01)
        # 6 px per frame at 640 px wide is 18 px per frame at 1920
        self.assertGreater(s["median_flow"], 2.5)
        self.assertAlmostEqual(s["median_flow"], 18, delta=2)
        self.assertEqual(len(per_second), 1)  # 119 frame pairs: one whole second
        self.assertEqual(s["cuts"], 0)

    def test_black_white_swaps_count_as_cuts_and_flips(self):
        s, _ = dyn.measure(str(self.flips))
        self.assertEqual(s["cuts"], 3)
        self.assertEqual(s["flips"], 3)
        self.assertAlmostEqual(s["cuts_per_10s"], 3 / (119 / 60) * 10, delta=0.1)

    def test_a_30_fps_clip_reads_at_60_fps(self):
        # the documented rule: repeats of a slower clip count as still, the seconds stay right
        s30, _ = dyn.measure(str(self.hold30))
        s60, _ = dyn.measure(str(self.hold60))
        self.assertAlmostEqual(s60["still_share"], 0.5, delta=0.03)
        self.assertAlmostEqual(s30["still_share"], 0.75, delta=0.03)
        self.assertAlmostEqual(s30["seconds"], s60["seconds"], delta=0.05)

    def test_window(self):
        s, _ = dyn.measure(str(self.hold60), 0.5, 1.5)
        self.assertGreaterEqual(s["still_share"], 0.95)
        self.assertAlmostEqual(s["seconds"], 1.0, delta=0.05)

    def test_cli_writes_the_json(self):
        out = self.dir / "dyn.json"
        r = run("dyn.py", self.panning, 0, 1.5, out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout)["src"], str(self.panning))
        data = json.loads(out.read_text())
        self.assertEqual(set(data), {"summary", "per_second"})
        self.assertEqual(len(data["per_second"]), 1)

    def test_cli_errors(self):
        r = run("dyn.py")
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)
        r = run("dyn.py", self.panning, 1, 0.5)
        self.assertEqual(r.returncode, 1)
        self.assertIn("must come after", r.stderr)
        r = run("dyn.py", self.sound)
        self.assertEqual(r.returncode, 1)
        self.assertIn("no frames decoded", r.stderr)
        self.assertNotIn("Traceback", r.stderr)


class HoldsTest(unittest.TestCase, Clips):
    def test_hold_timing_at_any_frame_rate(self):
        for clip in (self.hold30, self.hold60):
            with self.subTest(clip=clip.name):
                found = holds.find_holds(holds.changed_area(str(clip)), 0.3)
                self.assertEqual(len(found), 1, found)
                start, length, _ = found[0]
                self.assertAlmostEqual(start, 0.5, delta=0.04)
                self.assertAlmostEqual(length, 1.0, delta=0.04)

    def test_min_length_filters(self):
        area = holds.changed_area(str(self.hold60))
        self.assertEqual(holds.find_holds(area, 1.2), [])

    def test_cli_labels_beats(self):
        r = run("holds.py", self.hold60, 0.3, 120)
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = r.stdout.splitlines()
        self.assertRegex(lines[0], r"^\s*0\.\d\ds \(beat\s+1\.0\)  1\.\d\ds  mean change")
        self.assertRegex(lines[-1], r"^still share 0\.[45]\d*$")

    def test_cli_errors(self):
        r = run("holds.py")
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)
        r = run("holds.py", self.sound)
        self.assertEqual(r.returncode, 1)
        self.assertIn("no frames decoded", r.stderr)


if __name__ == "__main__":
    unittest.main()
