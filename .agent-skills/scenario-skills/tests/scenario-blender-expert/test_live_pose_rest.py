"""Runs bx_rig.apply_pose_as_rest in a real Blender on a posed mesh with a shape key.

pose_rest_cases.py builds the scene and writes the results to JSON; these tests read them.
Without Blender, or below the family's version floor (live_blender.py), every test skips.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from live_blender import BLENDER, SKIP

HERE = Path(__file__).parent
SCRIPTS = HERE.parents[1] / "skills" / "dcc" / "blender" / "scenario-blender-rigging" / "scripts"


@unittest.skipIf(SKIP, SKIP)
class PoseAsRest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_pose_rest_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "pose_rest_cases.py"), "--", str(SCRIPTS), str(out)],
            capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.r = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def test_modifier_apply_refuses_shape_keys(self):
        # the reason the helper exists: if Blender lifts this, the helper is optional
        self.assertIn("shape keys", self.r["refused"])

    def test_shared_mesh_data_is_refused_before_any_change(self):
        self.assertIn("single-user", self.r["shared_error"])
        self.assertIn("Cylinder.001", self.r["shared_error"])
        self.assertTrue(self.r["shared_untouched"])

    def test_pose_becomes_rest(self):
        self.assertTrue(self.r["pose_cleared"])
        self.assertLess(self.r["rest_tail_moved"], 1e-5)

    def test_mesh_and_key_keep_their_posed_shape(self):
        self.assertEqual(self.r["rewritten"], {"Cylinder": 2})
        self.assertLess(self.r["basis_err"], 1e-5)
        self.assertLess(self.r["key_err"], 1e-5)
        self.assertGreater(self.r["key_moves"], 0.01)  # the key still does something

    def test_stack_and_keys_unchanged(self):
        self.assertEqual(self.r["modifiers"], ["ARMATURE", "SUBSURF"])
        self.assertEqual(self.r["keys"], ["Basis", "bulge"])


if __name__ == "__main__":
    unittest.main()
