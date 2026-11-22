"""Builds a synthetic art set in a real Blender. Skipped unless BLENDER names the binary or `blender` is on the PATH."""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

BUILD = synth.SCRIPTS / "build_scene.py"


def blender(*args, blend=None):
    cmd = [synth.BLENDER, "-b"] + ([str(blend)] if blend else ["--factory-startup"])
    cmd += ["--python-exit-code", "1", *map(str, args)]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=600)


@unittest.skipUnless(synth.BLENDER, "Blender not found (set BLENDER to its binary)")
class BuildSceneTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.set = self.dir / "jungle"
        synth.art_set(self.set)
        self.assertEqual(synth.run("trace_hulls.py", self.set / "game").returncode, 0)
        self.blend = self.dir / "platformer_scene.blend"

    def build(self, *extra, blend=None):
        return blender("-P", BUILD, "--", "--set", self.set, *extra, blend=blend)

    def test_builds_bakes_and_saves(self):
        r = self.build()
        self.assertEqual(r.returncode, 0, r.stdout[-2000:] + r.stderr[-2000:])
        self.assertIn("RESULT ok", r.stdout)
        self.assertEqual(r.stdout.count("FINAL "), 7)      # four tower pieces and three fruit
        self.assertTrue(self.blend.is_file())
        # the jump still is scaled by the clip's canvas, not a fixed 960 / 768
        probe = ("import bpy; o = bpy.data.objects['Hero_Jump']; "
                 "print('HEIGHT', round(o.dimensions.z, 3))")
        r = blender("--python-expr", probe, blend=self.blend)
        expected = 1.62 / 84 * (192 * 4 // 5)               # hero_h / run_fig_px * run_canvas_px
        self.assertIn(f"HEIGHT {round(expected, 3)}", r.stdout)

    def test_keeps_an_existing_blend_without_force(self):
        self.assertEqual(self.build().returncode, 0)
        r = self.build()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--force", r.stdout)

    def test_live_empties_only_a_new_file_or_its_own_output(self):
        r = self.build("--live")
        self.assertEqual(r.returncode, 0, r.stdout[-2000:])
        r = self.build("--live", "--force", blend=self.blend)
        self.assertEqual(r.returncode, 0, r.stdout[-2000:])
        other = self.dir / "my_work.blend"
        self.blend.rename(other)
        r = self.build("--live", "--force", blend=other)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("save your work", r.stdout)

    def test_needs_shapes_json(self):
        (self.set / "game" / "shapes.json").unlink()
        r = self.build()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("trace_hulls.py", r.stdout)


if __name__ == "__main__":
    unittest.main()
