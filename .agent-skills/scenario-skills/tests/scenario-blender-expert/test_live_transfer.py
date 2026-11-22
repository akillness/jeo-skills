"""Runs bx_rig's robust weight transfer and garment depth check in a real Blender.

transfer_cases.py builds hips, two legs, a skirt and a sleeve, transfers the weights by nearest
face and by the robust route, poses a leg and writes the results to JSON; these tests read them.
Without Blender every test skips.
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
class Transfer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_transfer_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "transfer_cases.py"), "--", str(SCRIPTS), str(out)],
            capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.r = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def test_only_the_band_near_the_skin_is_copied(self):
        r = self.r
        self.assertEqual(r["matched"] + r["inpainted"], r["vertices"])
        self.assertGreater(r["inpainted"], r["matched"])  # the skirt below the hips hangs free
        self.assertEqual(r["sleeve_inpainted"], 0)  # a tight sleeve is copied whole

    def test_a_gate_that_copies_nothing_raises(self):
        err = self.r["zero_match_error"]
        self.assertIsNotNone(err)
        self.assertIn("no vertex of SkirtRobust", err)
        self.assertIn("closest gap 0.025", err)

    def test_a_detached_part_follows_the_copied_band_not_the_nearest_leg(self):
        self.assertEqual(self.r["share_hoop"]["hips"], self.r["hoop_vertices"])

    def test_a_source_with_a_live_mirror_raises(self):
        self.assertIn("Mirror", self.r["mirror_robust_error"] or "")

    def test_depth_rejects_poses_with_missing_controls(self):
        self.assertIn("thigh_fk.L", self.r["missing_controls_error"] or "")

    def test_depth_sees_the_mirrored_half_of_the_body(self):
        self.assertIn(["leg_forward.R", "SkirtRobust"], self.r["depth_full_r"])
        self.assertEqual(self.r["depth_mirror"], self.r["depth_full_r"])

    def test_nearest_face_splits_the_skirt_between_the_legs(self):
        s = self.r["share_nearest"]
        self.assertGreater(min(s["thigh.L"], s["thigh.R"]), 200)
        self.assertGreater(self.r["strain_nearest"]["bad"], 0)
        self.assertGreater(self.r["strain_nearest"]["max"], 1.6)

    def test_robust_skirt_follows_the_hips_without_tearing(self):
        self.assertGreater(self.r["share_robust"]["hips"], 0.9 * self.r["vertices"])
        self.assertEqual(self.r["strain_robust"]["bad"], 0)
        self.assertLess(self.r["strain_robust"]["max"], 1.6)
        lo, hi = self.r["sums_robust"]
        self.assertAlmostEqual(lo, 1.0, places=4)
        self.assertAlmostEqual(hi, 1.0, places=4)
        self.assertTrue(self.r["report_robust"]["ok"])

    def test_depth_is_zero_at_rest(self):
        d = self.r["depth"]
        self.assertEqual(set(d["rest_inside"].values()), {0})
        self.assertEqual({g["over"] for g in d["poses"]["rest"].values()}, {0})

    def test_depth_flags_the_leg_through_the_skirt_only(self):
        d = self.r["depth"]
        fail = {tuple(f) for f in d["fail"]}
        self.assertIn(("leg_forward.L", "SkirtRobust"), fail)
        self.assertNotIn(("leg_forward.L", "Sleeve"), fail)
        self.assertGreater(d["poses"]["leg_forward.L"]["SkirtRobust"]["max"], 0.05)


if __name__ == "__main__":
    unittest.main()
