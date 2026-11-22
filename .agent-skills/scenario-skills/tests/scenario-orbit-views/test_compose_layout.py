import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-orbit-views" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import compose_layout as cl  # noqa: E402


class ComposeTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        Image.new("RGB", (64, 64), (0, 0, 255)).save(self.dir / "bg_00.png")
        clay = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        clay.paste((128, 128, 128, 255), (16, 16, 48, 48))
        clay.save(self.dir / "clay_00.png")
        Image.new("RGB", (64, 64)).save(self.dir / "bg_01.png")  # no clay pair

    def test_clay_over_background(self):
        out = cl.compose(self.dir / "bg_00.png", self.dir / "clay_00.png")
        self.assertEqual(out.mode, "RGB")
        self.assertEqual(out.getpixel((32, 32)), (128, 128, 128))
        self.assertEqual(out.getpixel((2, 2)), (0, 0, 255))

    def test_keys_need_both_passes(self):
        self.assertEqual(cl.keys_in(self.dir), ["00"])

    def test_main_writes_layouts(self):
        cl.main([str(self.dir)])
        self.assertTrue((self.dir / "layout_00.jpg").exists())
        self.assertFalse((self.dir / "layout_01.jpg").exists())


if __name__ == "__main__":
    unittest.main()
