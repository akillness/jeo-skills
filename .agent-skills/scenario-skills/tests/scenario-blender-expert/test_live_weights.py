"""Runs bx_rig.weight_report's mirror check in a real Blender on symmetric weighted grids.

weight_cases.py builds the grids, with Blender (.L/.R) and engine (_l/_r) side names, and
writes the results to JSON; these tests read them. Without Blender, or below the family's
version floor (live_blender.py), every test skips.
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
class WeightMirror(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_weight_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "weight_cases.py"), "--", str(SCRIPTS), str(out)],
            capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.r = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def test_mirror_name(self):
        self.assertEqual(self.r["names"], {
            "upper_arm.L": "upper_arm.R", "upper_arm.R": "upper_arm.L",
            "DEF-lid.T.L.001": "DEF-lid.T.R.001", "f_index.01.R": "f_index.01.L",
            "clavicle_l": "clavicle_r", "thigh_r": "thigh_l", "foot-L": "foot-R",
            "spine_01": "", "head": "", "lowerarm_l.001": "lowerarm_r.001",
        })

    def test_engine_names_mirror_cleanly(self):
        # before the fix, clavicle_l was compared with itself and reported 1.0
        r = self.r["engine"]
        self.assertGreater(r["mirror_pairs_sampled"], 0)
        self.assertEqual(r["mirror_err"], 0.0)

    def test_engine_names_catch_a_planted_mismatch(self):
        self.assertAlmostEqual(self.r["engine_planted"]["mirror_err"], 0.6, places=4)

    def test_blender_names_unchanged(self):
        r = self.r["blender"]
        self.assertGreater(r["mirror_pairs_sampled"], 0)
        self.assertEqual(r["mirror_err"], 0.0)


if __name__ == "__main__":
    unittest.main()
