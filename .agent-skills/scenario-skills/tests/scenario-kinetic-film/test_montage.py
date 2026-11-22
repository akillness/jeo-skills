"""montage.py: labeled contact sheets, mixed aspect ratios, and an output that would overwrite an input."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

import media


def run(*args):
    return subprocess.run([sys.executable, "-I", str(media.SCRIPTS / "montage.py"), *map(str, args)], capture_output=True, text=True)


class MontageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        d = Path(self.tmp.name)
        self.wide = [str(d / f"t_{i:06.2f}.png") for i in (0.5, 1, 1.5)]
        for i, p in enumerate(self.wide):
            cv2.imwrite(p, np.full((180, 320, 3), 60 * i, np.uint8))
        self.tall = str(d / "tall.png")
        cv2.imwrite(self.tall, np.full((240, 320, 3), 200, np.uint8))
        self.out = str(d / "sheet.jpg")

    def test_two_column_sheet(self):
        r = run(self.out, 2, 160, *self.wide)
        self.assertEqual(r.returncode, 0, r.stderr)
        sheet = cv2.imread(self.out)
        # 2 rows of 90 px tiles plus a 4 px border each; 2 columns of 160 px plus 4 px each
        self.assertEqual(sheet.shape[:2], (2 * 94, 2 * 164))

    def test_mixed_aspect_tiles_pad_to_the_tallest(self):
        r = run(self.out, 2, 160, self.wide[0], self.tall, self.wide[1])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(cv2.imread(self.out).shape[:2], (2 * 124, 2 * 164))

    def test_labels_drop_the_still_prefix(self):
        r = run(self.out, 1, 320, self.wide[0])
        self.assertEqual(r.returncode, 0, r.stderr)
        sheet = cv2.imread(self.out)
        # the green label sits in the top left corner of the tile
        green = (sheet[:40, :, 1] > 150) & (sheet[:40, :, 2] < 100)
        right = np.nonzero(green.any(axis=0))[0].max()
        (width, _), _ = cv2.getTextSize("000.50", cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        self.assertLess(abs(right - (8 + width)), 6)  # "000.50", not "t_000.50"

    def test_refuses_to_overwrite_an_input(self):
        r = run(self.wide[0], 2, 160, *self.wide)
        self.assertEqual(r.returncode, 1)
        self.assertIn("is also an input", r.stderr)
        self.assertEqual(cv2.imread(self.wide[0]).shape, (180, 320, 3))

    def test_usage_and_bad_input(self):
        self.assertEqual(run().returncode, 2)
        r = run(self.out, 2, 160, Path(self.tmp.name) / "missing.png")
        self.assertEqual(r.returncode, 1)
        self.assertIn("could not read", r.stderr)


if __name__ == "__main__":
    unittest.main()
