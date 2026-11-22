"""make_patch.py: donor copy, feathering, padding inside the canvas, and the take checks."""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

import helpers

SIZE = (400, 500)


class PatchTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.src = np.random.default_rng(0).integers(0, 255, (SIZE[1], SIZE[0], 3), dtype=np.uint8)
        Image.fromarray(self.src).save(self.dir / "frame.png")

    def make(self, pieces, **cfg):
        helpers.write_json(self.dir / "patch.json", {"source": "frame.png", "pieces": pieces, "out": "patch.png", **cfg})
        return helpers.run("make_patch.py", self.dir / "patch.json")

    def test_patch_copies_the_donor_and_pads_inside_the_canvas(self):
        result = self.make([{"dest": [350, 10, 390, 50], "offset": [-100, 0]}], start=0, end=333)
        self.assertEqual(result.returncode, 0, result.stderr)
        layer = json.loads((self.dir / "patch.png.layer.json").read_text())
        self.assertEqual([layer[k] for k in ("x", "y", "width", "height")], ["96", "0", "304", "304"])
        # Ends half a frame before frame 333 (11.1 s): compose draws a layer on its endTime frame.
        self.assertEqual((layer["type"], layer["fit"], layer["startTime"], layer["endTime"]), ("image", "fill", 0.0, 11.083))
        patch = np.asarray(Image.open(self.dir / "patch.png"))
        inside = patch[10:50, 350 - 96:390 - 96]
        self.assertTrue((inside[..., 3] == 255).all())
        np.testing.assert_array_equal(inside[..., :3], self.src[10:50, 250:290])
        self.assertEqual(int(patch[..., 3].astype(bool).sum()), 40 * 40)

    def test_feather_softens_only_the_named_side(self):
        self.make([{"dest": [100, 100, 140, 140], "offset": [0, 200], "feather": {"top": 8}}])
        layer = json.loads((self.dir / "patch.png.layer.json").read_text())
        x, y = int(layer["x"]), int(layer["y"])
        alpha = np.asarray(Image.open(self.dir / "patch.png"))[100 - y:140 - y, 100 - x:140 - x, 3]
        self.assertEqual(int(alpha[0].max()), 0)
        self.assertTrue((np.diff(alpha[:9, 20].astype(int)) >= 0).all())
        self.assertTrue((alpha[8:] == 255).all())
        self.assertTrue((alpha[:, 0] == alpha[:, 20]).all())

    def test_a_donor_outside_the_frame_fails(self):
        result = self.make([{"dest": [350, 10, 390, 50], "offset": [100, 0]}])
        self.assertEqual(result.returncode, 2)
        self.assertIn("falls outside the frame", result.stderr)

    @unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg")
    def test_takes_flag_motion_through_the_box(self):
        for name, moving in (("still.mp4", False), ("moving.mp4", True)):
            frames = np.repeat(self.src[None], 8, 0).copy()
            if moving:
                for k in range(8):
                    frames[k, 100:130, 60 + 20 * k:90 + 20 * k] = 255
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{SIZE[0]}x{SIZE[1]}",
                            "-r", "30", "-i", "-", "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p",
                            str(self.dir / name)], input=frames.tobytes(), check=True)
        piece = [{"dest": [100, 90, 160, 140], "offset": [0, 200]}]
        still = self.make(piece, takes=["still.mp4"])
        self.assertEqual(still.returncode, 0, still.stdout + still.stderr)
        self.assertIn("take still.mp4: 0.0% of the box moves", still.stdout)
        moving = self.make(piece, takes=["moving.mp4"])
        self.assertEqual(moving.returncode, 1)
        self.assertIn("CHECK: something moves through the box", moving.stdout)


if __name__ == "__main__":
    unittest.main()
