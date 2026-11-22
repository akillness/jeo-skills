"""audit.py on a lossless clip with one frozen frame, a cropped band and a flash."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

import media


def run(*args):
    return subprocess.run([sys.executable, "-I", str(media.SCRIPTS / "audit.py"), *map(str, args)], capture_output=True, text=True)


def faulty_frames():
    rng = np.random.default_rng(9)
    frames = [rng.integers(0, 256, (360, 640, 3), dtype=np.uint8) for _ in range(60)]
    frames[30] = frames[29].copy()  # a stale capture between moving frames
    for i in (10, 11, 12):
        frames[i][-24:] = 0  # a capture that lost its bottom rows
    frames[45] = np.full((360, 640, 3), 255, np.uint8)  # a single-frame flash
    return frames


class AuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.clip = media.write_video(Path(cls.tmp.name) / "faulty.mkv", faulty_frames(), 60)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_reports_each_fault_on_its_frame(self):
        r = run(self.clip)
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = r.stdout.splitlines()
        self.assertTrue(lines[0].startswith("60 frames;"), lines[0])
        self.assertEqual(lines[1], "stale (frozen between moving frames): [30]")
        self.assertEqual(lines[2], "blank bottom band (<3.0): [10, 11, 12]")
        self.assertEqual(lines[3], "single-frame luma spikes: [45]")

    def test_frame_offset_shifts_the_numbers(self):
        r = run(self.clip, 1000)
        self.assertIn("stale (frozen between moving frames): [1030]", r.stdout)
        self.assertIn("single-frame luma spikes: [1045]", r.stdout)

    def test_usage_and_unreadable_input(self):
        r = run()
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)
        r = run(Path(self.tmp.name) / "missing.mp4")
        self.assertEqual(r.returncode, 1)
        self.assertIn("no frames decoded", r.stderr)


if __name__ == "__main__":
    unittest.main()
