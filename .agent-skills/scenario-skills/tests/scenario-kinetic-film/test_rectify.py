"""rectify.py on a filmed screen: a drifting camera over a static desk, a screen whose content changes."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

import media

QUAD = [[200, 110], [440, 110], [440, 245], [200, 245]]
BAND = [262, 360]
DRIFT = 0.5  # px per frame: the camera pans right, so the picture slides left


def filmed_screen(n=60):
    desk = media.texture(760, 360, seed=12, blur=4)
    caption = media.texture(640, BAND[1] - BAND[0], seed=14, blur=2)
    rng = np.random.default_rng(13)
    for i in range(n):
        canvas = desk.copy()
        # the screen sits on the desk at canvas x 240..480; its content changes every frame
        canvas[110:245, 240:480] = rng.integers(0, 256, (135, 240, 3), dtype=np.uint8)
        shift = np.float32([[1, 0, -(40 + DRIFT * i)], [0, 1, 0]])
        frame = cv2.warpAffine(canvas, shift, (640, 360), flags=cv2.INTER_LINEAR)
        # a burnt-in caption: fixed on the frame, not on the desk, with more detail than the desk
        frame[BAND[0] : BAND[1]] = caption
        yield frame


def run(*args):
    return subprocess.run([sys.executable, "-I", str(media.SCRIPTS / "rectify.py"), *map(str, args)], capture_output=True, text=True)


class RectifyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.clip = media.write_video(cls.dir / "filmed.mkv", filmed_screen(), 30)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_tracks_the_drift_and_writes_every_frame(self):
        out = self.dir / "flat.mp4"
        r = run(self.clip, out, 1.0, 0, json.dumps(QUAD), json.dumps(BAND), "--size", "320x180")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.splitlines()[-1], "frames 31")  # frames 0 to 30 lie within 1.0 s
        self.assertEqual(media.ffprobe(out, "stream=width,height"), "320,180")
        quads = json.loads(Path(str(out) + ".quads.json").read_text())
        self.assertEqual(len(quads), 31)
        for i, q in enumerate(quads):
            expected = np.float32(QUAD) - [DRIFT * i, 0]
            self.assertLess(np.abs(np.float32(q) - expected).max(), 1.5, f"frame {i}")

    def test_argument_errors(self):
        r = run()
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)
        r = run(self.clip, self.dir / "x.mp4", 1, 0, json.dumps(QUAD[:3]), json.dumps(BAND))
        self.assertEqual(r.returncode, 1)
        self.assertIn("4 [x,y] corners", r.stderr)
        r = run(self.clip, self.dir / "x.mp4", 1, 0, json.dumps(QUAD), "[1]")
        self.assertEqual(r.returncode, 1)
        self.assertIn("2 values", r.stderr)

    def test_a_reference_time_past_the_end(self):
        r = run(self.clip, self.dir / "x.mp4", 1, 30, json.dumps(QUAD), json.dumps(BAND))
        self.assertEqual(r.returncode, 1)
        self.assertIn("no frame at ref_t", r.stderr)
        self.assertNotIn("Traceback", r.stderr)


if __name__ == "__main__":
    unittest.main()
