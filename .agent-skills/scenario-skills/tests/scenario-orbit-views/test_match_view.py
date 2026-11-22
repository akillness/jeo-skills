import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-orbit-views" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import match_view as mv  # noqa: E402


def silhouette(path, box, size=128, rgba=True):
    if rgba:
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(im).rectangle(box, fill=(90, 90, 90, 255))
    else:
        im = Image.new("RGB", (size, size), (230, 230, 230))
        ImageDraw.Draw(im).rectangle(box, fill=(40, 90, 160))
    im.save(path)


class IouTests(unittest.TestCase):
    def test_iou_bounds(self):
        a = np.zeros((4, 4), bool)
        a[:2] = True
        self.assertEqual(mv.iou(a, a), 1.0)
        self.assertEqual(mv.iou(a, ~a), 0.0)
        self.assertEqual(mv.iou(np.zeros((2, 2), bool), np.zeros((2, 2), bool)), 0.0)

    def test_normalise_ignores_scale_and_position(self):
        small = np.zeros((100, 100), bool)
        small[10:30, 10:20] = True
        big = np.zeros((300, 300), bool)
        big[100:220, 150:210] = True
        self.assertGreater(mv.iou(mv.normalise(small), mv.normalise(big)), 0.9)

    def test_source_mask_fills_holes(self):
        d = Path(tempfile.mkdtemp())
        im = Image.new("RGB", (96, 96), (230, 230, 230))
        draw = ImageDraw.Draw(im)
        draw.rectangle((20, 20, 76, 76), fill=(40, 90, 160))
        draw.rectangle((40, 40, 56, 56), fill=(230, 230, 230))  # hole in the subject
        im.save(d / "src.png")
        m = mv.source_mask(d / "src.png")
        self.assertTrue(m[48, 48])
        self.assertFalse(m[5, 5])


class RankTests(unittest.TestCase):
    def test_best_view_wins(self):
        d = Path(tempfile.mkdtemp())
        silhouette(d / "src.png", (40, 20, 88, 108), rgba=False)  # tall
        silhouette(d / "a.png", (44, 24, 84, 104))  # tall, same shape
        silhouette(d / "b.png", (10, 50, 118, 78))  # wide
        views = [{"az": 10, "el": 0, "file": "a.png"}, {"az": -40, "el": 20, "file": "b.png"}]
        (d / "cameras.json").write_text(json.dumps({"views": views}))
        rows = mv.rank(d / "src.png", d / "cameras.json")
        self.assertEqual(rows[0][1:], (10, 0))
        self.assertGreater(rows[0][0], rows[1][0])


if __name__ == "__main__":
    unittest.main()
