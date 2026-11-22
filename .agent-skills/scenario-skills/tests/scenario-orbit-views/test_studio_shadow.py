import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-orbit-views" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import studio_shadow as ss  # noqa: E402


class StudioShadowTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        clay = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        d = ImageDraw.Draw(clay)
        d.rectangle((20, 70, 110, 100), fill=(0, 0, 0, 120))  # shadow on the floor
        d.rectangle((50, 20, 70, 90), fill=(100, 100, 100, 255))  # clay body
        clay.save(self.dir / "clay.png")
        cut = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        ImageDraw.Draw(cut).rectangle((52, 22, 68, 88), fill=(200, 40, 40, 255))
        cut.save(self.dir / "cut.png")

    def test_shadow_excludes_clay_body(self):
        sh = ss.shadow_alpha(Image.open(self.dir / "clay.png"), 128)
        self.assertEqual(sh[40, 60], 0.0)  # inside the body
        self.assertGreater(sh[85, 100], 0.3)  # floor shadow away from the body
        self.assertEqual(sh[85, 72], 0.0)  # body margin, no outline

    def test_composite_keeps_subject_and_adds_shadow(self):
        out = ss.studio_rgba(self.dir / "clay.png", self.dir / "cut.png", size=128)
        arr = np.asarray(out)
        self.assertEqual(tuple(arr[50, 60]), (200, 40, 40, 255))
        self.assertGreater(arr[85, 100, 3], 0)
        self.assertEqual(arr[5, 5, 3], 0)

    def test_cutout_check_flags_failed_removals(self):
        clay = Image.open(self.dir / "clay.png")
        good = np.asarray(Image.open(self.dir / "cut.png"), dtype=np.float32)[..., 3] / 255
        self.assertEqual(ss.cutout_check(clay, good), (1.0, 0.0, 0.0))
        kept = np.ones((128, 128), np.float32)  # background left in place
        covered, outside, corner = ss.cutout_check(clay, kept)
        self.assertGreater(outside, 0.5)
        self.assertEqual(corner, 1.0)
        holed = good.copy()
        holed[55:, :] = 0  # lower half of the subject removed
        self.assertLess(ss.cutout_check(clay, holed)[0], 0.6)

    def test_defringe_recolors_edges_only(self):
        cut = Image.new("RGBA", (32, 32), (0, 0, 255, 0))
        px = cut.load()
        for x in range(8, 24):
            for y in range(8, 24):
                px[x, y] = (255, 0, 0, 255)
        px[7, 16] = (0, 0, 255, 128)  # blue spill on the edge
        out = ss.defringe(cut).load()
        self.assertEqual(out[16, 16], (255, 0, 0, 255))
        r, g, b, a = out[7, 16]
        self.assertGreater(r, b)
        self.assertEqual(a, 128)


if __name__ == "__main__":
    unittest.main()
