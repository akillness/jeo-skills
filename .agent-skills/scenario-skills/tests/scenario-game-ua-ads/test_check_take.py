"""check_take.py: the motion check on synthetic H.264 takes, and the sheet, action and ends looks."""

import json
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

import helpers

W, H, FPS = 360, 640, 30
SQ = 40
TOP = (20, 40, 320, 120)  # the allowed box around square A's path
LEVEL = 10, 5  # gray level of frame i in the index-coded clips: 10 + 5 * i


def background():
    """A static, noise-free frame with gradients, a fine checker and 1 px lines, the hard parts for H.264."""
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.stack([40 + 120 * xx / W, 60 + 100 * yy / H, 90 + 60 * np.sin(xx / 17) * np.cos(yy / 23)], -1)
    img[300:420, 200:320] = np.where(((xx[300:420, 200:320] // 6 + yy[300:420, 200:320] // 6) % 2)[..., None] == 1, 240, 20)
    img[480:600:4, 20:340] = 250
    return np.clip(img, 0, 255).astype(np.uint8)


def square_a(i):
    return 40 + round(i * 220 / 59), 80


def clip(path, *squares, n=60, **kw):
    """A take of n frames; each square is a function of the frame index returning its top-left corner."""
    bg = background()
    frames = []
    for i in range(n):
        f = bg.copy()
        for pos in squares:
            x, y = pos(i)
            f[y:y + SQ, x:x + SQ] = 255
        frames.append(f)
    return helpers.encode(path, frames, **kw)


def indexed(path, n):
    return helpers.encode(path, [np.full((H, W, 3), LEVEL[0] + LEVEL[1] * i, np.uint8) for i in range(n)], crf=10)


def index_of(tile):
    return round((float(np.mean(tile)) - LEVEL[0]) / LEVEL[1])


def box_args(flag, box):
    return [flag, *map(str, box)]


def size(path):
    with Image.open(path) as im:
        return im.size


def pixels(path):
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"))


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class MotionTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def motion(self, take, *args):
        return helpers.run("check_take.py", "motion", take, "-o", self.dir / "report.json", *args)

    def report(self):
        return json.loads((self.dir / "report.json").read_text())

    def test_motion_inside_the_allowed_box_passes(self):
        take = clip(self.dir / "take.mp4", square_a)
        result = self.motion(take, *box_args("--allow", TOP))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("FLAG", result.stdout)
        self.assertEqual(self.report()["spans"], [])

    def test_motion_outside_the_box_is_flagged_where_and_when_it_happens(self):
        def square_b(i):  # still until frame 29, then 6 px a frame to the right: about 0.2% of the frame changes
            return 40 + 6 * max(0, i - 29), 200

        take = clip(self.dir / "take.mp4", square_a, square_b)
        result = self.motion(take, *box_args("--allow", TOP), "--sheet", self.dir / "flagged.jpg")
        self.assertEqual(result.returncode, 1)
        self.assertIn("FAIL 1 span(s)", result.stderr)
        (span,) = self.report()["spans"]
        self.assertLessEqual(abs(span["start"] - 1.0), 1 / FPS + 1e-6, span)
        self.assertAlmostEqual(span["end"], 59 / FPS, delta=1 / FPS + 1e-6)
        x, y, w, h = span["box"]
        moved = (40, 200, 40 + 6 * 30 + SQ, 200 + SQ)  # x0, y0, x1, y1 swept by square B
        self.assertTrue(moved[0] - 8 <= x <= moved[0] and moved[1] - 8 <= y <= moved[1], span)
        self.assertTrue(moved[2] <= x + w <= moved[2] + 8 and moved[3] <= y + h <= moved[3] + 8, span)
        self.assertEqual(size(self.dir / "flagged.jpg"), (W, H))

    def test_allow_at_suppresses_only_inside_its_window(self):
        def square_b(i):  # moves on frames 15 to 44, 0.5 to 1.467 s
            return 40 + 6 * min(max(i - 14, 0), 30), 200

        take = clip(self.dir / "take.mp4", square_b)
        path = ["0", "190", "280", "60"]
        result = self.motion(take, "--allow-at", "0.4", "1.0", *path)
        self.assertEqual(result.returncode, 1)
        (span,) = self.report()["spans"]
        self.assertTrue(1.0 < span["start"] <= 1.0 + 1 / FPS + 1e-6, span)
        self.assertAlmostEqual(span["end"], 44 / FPS, delta=1 / FPS + 1e-6)
        self.assertEqual(self.motion(take, "--allow-at", "0.4", "1.6", *path).returncode, 0)

    def test_a_static_take_stays_silent_through_compression(self):
        take = clip(self.dir / "take.mp4", gop=10)  # a keyframe every 10 frames re-codes the whole frame
        for scale in ("270", "360"):  # 360 is the native width: no averaging
            with self.subTest(scale=scale):
                result = self.motion(take, "--scale", scale)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertLess(self.report()["max_share"], 0.001 / 4)


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class LookTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def test_action_tiles_native_crops_centered_on_the_moment(self):
        take = indexed(self.dir / "take.mp4", 45)
        box = (51, 61, 64, 48)
        result = helpers.run("check_take.py", "action", take, self.dir / "crops.png", "--at", "0.8",
                             *box_args("--box", box), "--span", "0.6", "--tiles", "7", "--cols", "4")
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = [15, 18, 21, 24, 27, 30, 33]
        self.assertIn("tile 4: 0.800 s (frame 24)", result.stdout)
        im = pixels(self.dir / "crops.png")
        self.assertEqual(im.shape[:2], (2 * box[3], 4 * box[2]))
        tiles = [im[r * box[3]:(r + 1) * box[3], c * box[2]:(c + 1) * box[2]] for r in range(2) for c in range(4)]
        self.assertEqual([index_of(t) for t in tiles[:7]], expected)
        self.assertLess(float(tiles[7].mean()), LEVEL[0] - 2)  # the eighth slot stays empty

        result = helpers.run("check_take.py", "action", take, self.dir / "default.jpg", "--at", "0.75", *box_args("--box", box))
        times = [float(line.split()[2]) for line in result.stdout.splitlines() if line.startswith("tile ")]
        self.assertEqual(len(times), 8)
        self.assertAlmostEqual(np.mean(times), 0.75, delta=1 / FPS)
        self.assertEqual(size(self.dir / "default.jpg"), (4 * box[2], 2 * box[3]))

    def test_ends_are_the_first_and_last_decoded_frames(self):
        take = indexed(self.dir / "take.mp4", 47)
        result = helpers.run("check_take.py", "ends", take, self.dir / "ends")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("frame 46", result.stdout)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(take), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             capture_output=True, check=True).stdout
        decoded = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
        first = pixels(self.dir / "ends/first.png")
        last = pixels(self.dir / "ends/last.png")
        np.testing.assert_array_equal(first, decoded[0])
        np.testing.assert_array_equal(last, decoded[-1])
        self.assertEqual((index_of(first), index_of(last)), (0, 46))

    def test_sheet_tiles_the_whole_take(self):
        take = clip(self.dir / "take.mp4", square_a)
        result = helpers.run("check_take.py", "sheet", take, self.dir / "sheet.jpg")
        self.assertEqual(result.returncode, 0, result.stderr)
        n = int(result.stdout.split(": ")[1].split()[0])
        self.assertIn(n, (4, 5))  # 2 s at 2 fps; the last tile depends on the ffmpeg version
        self.assertEqual(size(self.dir / "sheet.jpg"), (min(10, n) * 216, math.ceil(n / 10) * 384))

    def test_sheet_tiles_are_the_frames_their_labels_name(self):
        take = indexed(self.dir / "take.mp4", 45)
        result = helpers.run("check_take.py", "sheet", take, self.dir / "sheet.png", "--cols", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("rows start at 0, 0.5, 1 s", result.stdout)
        im = pixels(self.dir / "sheet.png")
        self.assertEqual(im.shape[:2], (3 * 384, 216))
        self.assertEqual([index_of(im[r * 384:(r + 1) * 384]) for r in range(3)], [0, 15, 30])  # not 7, 22, 37
        result = helpers.run("check_take.py", "sheet", take, self.dir / "row.png")
        self.assertIn("3 tiles", result.stdout)
        self.assertIn("rows start at 0 s", result.stdout)


if __name__ == "__main__":
    unittest.main()
