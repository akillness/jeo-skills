"""render_grounded.py in a real Blender. Skipped unless BLENDER names the binary or `blender` is on the PATH.

The other suites reach the script through a stand-in bpy, which cannot tell whether the glTF
import, the dome projection or the Cycles renders work. This one renders two cameras for real.
"""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "scenario-orbit-views" / "scripts" / "render_grounded.py"
BLENDER = os.environ.get("BLENDER") or shutil.which("blender")

MAKE_GLB = """
import sys, bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1, location=(3, -2, 5))
bpy.context.active_object.scale = (1, 1, 2)
bpy.ops.export_scene.gltf(filepath=sys.argv[sys.argv.index("--") + 1], export_format="GLB")
"""

SKY = (40, 90, 220)
FLOOR = (40, 170, 60)


def blender(*args):
    return subprocess.run([BLENDER, "-b", "--factory-startup", "--python-exit-code", "1", *map(str, args)],
                          capture_output=True, text=True, timeout=900)


@unittest.skipUnless(BLENDER, "Blender not found (set BLENDER to its binary)")
class RenderGroundedBlenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name).resolve()
        cls.glb = cls.dir / "box.glb"
        r = blender("--python-expr", MAKE_GLB, "--", cls.glb)
        if r.returncode != 0 or not cls.glb.is_file():
            raise AssertionError(r.stdout[-2000:] + r.stderr[-2000:])
        # Upper half sky, lower half floor: the dome's horizon sits at the eye height.
        pano = np.zeros((64, 128, 3), np.uint8)
        pano[:32] = SKY
        pano[32:] = FLOOR
        cls.pano = cls.dir / "pano.png"
        Image.fromarray(pano).save(cls.pano)
        cls.out = cls.dir / "views"
        cls.render = blender("--python", SCRIPT, "--", "--glb", cls.glb, "--pano", cls.pano,
                          "--out", cls.out, "--az0", "30", "--size", "64", "--samples", "4",
                          "--only", "00,top")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def image(self, name):
        return np.asarray(Image.open(self.out / name).convert("RGBA")).astype(int)

    def test_renders_both_plates_for_each_camera(self):
        self.assertEqual(self.render.returncode, 0, self.render.stdout[-2000:] + self.render.stderr[-2000:])
        self.assertIn("DONE 2", self.render.stdout)
        for key in ("00", "top"):
            for kind in ("bg", "clay"):
                with Image.open(self.out / f"{kind}_{key}.png") as im:
                    self.assertEqual(im.size, (64, 64))
                    self.assertEqual(im.mode, "RGBA")

    def test_manifest_lists_the_requested_cameras(self):
        manifest = json.loads((self.out / "cameras.json").read_text(encoding="utf-8"))
        self.assertEqual([(v["key"], v["az"], v["el"]) for v in manifest["views"]],
                         [("00", 30.0, 8.0), ("top", 30.0, 88.0)])
        self.assertGreater(manifest["dist"], 0)

    def test_clay_plate_isolates_the_subject_over_transparency(self):
        clay = self.image("clay_00.png")
        alpha = clay[..., 3]
        # At 4 samples the shadow catcher leaves faint noise, so the margins are near-clear, not clear.
        self.assertLess(alpha[:, :6].mean(), 20)
        self.assertLess(alpha[:6].mean(), 20)
        # Normalized and framed, the subject covers the middle of the plate.
        self.assertGreater(alpha[24:40, 24:40].mean(), 200)
        # The cast shadow: partly transparent pixels on the floor below the subject.
        floor = alpha[52:]
        self.assertGreater(((floor > 40) & (floor < 250)).sum(), 10)

    def test_background_plate_shows_the_panorama_in_perspective(self):
        bg = self.image("bg_00.png")
        self.assertTrue((bg[..., 3] == 255).all())
        top, bottom = bg[:6, :, :3].mean(axis=(0, 1)), bg[-6:, :, :3].mean(axis=(0, 1))
        # Near eye level, sky above and floor below; the subject is hidden from this plate.
        self.assertGreater(top[2], top[1])
        self.assertGreater(bottom[1], bottom[2])
        # From above, the camera sees only floor.
        top_view = self.image("bg_top.png")[..., :3].mean(axis=(0, 1))
        self.assertGreater(top_view[1], top_view[2])


if __name__ == "__main__":
    unittest.main()
