"""Runs bx_anim's foot contact and slip helpers in a real Blender on a foot with known contacts.

slip_cases.py keys the foot and writes the results to JSON; these tests read them. Without
Blender, or below the family's version floor (live_blender.py), every test skips.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from live_blender import BLENDER, SKIP

HERE = Path(__file__).parent
SCRIPTS = HERE.parents[1] / "skills" / "dcc" / "blender" / "scenario-blender-animation" / "scripts"


@unittest.skipIf(SKIP, SKIP)
class FootSlip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_slip_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "slip_cases.py"), "--", str(SCRIPTS), str(out)],
            capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.r = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def ranges(self, key):
        return [tuple(r) for r in self.r[key]]

    def test_contacts_from_height(self):
        # the skim at 19-20 counts as planted; the two-frame touch at 35-36 is dropped
        self.assertEqual(self.ranges("height_only"), [(1, 10), (19, 30)])

    def test_onset_drops_the_skim(self):
        self.assertEqual(self.ranges("onset"), [(1, 10), (21, 30)])

    def test_onset_drops_a_range_that_never_slows(self):
        self.assertEqual(self.ranges("cut_in_skim"), [(1, 10), (19, 20)])
        self.assertEqual(self.ranges("cut_in_skim_onset"), [(1, 10)])

    def test_onset_reads_the_first_frame_speed(self):
        self.assertEqual(self.ranges("start_in_skim_onset"), [(21, 30)])

    def test_ankle_alone_loses_the_roll(self):
        self.assertEqual(self.ranges("ankle_only"), [(1, 8), (19, 30)])

    def test_ball_keeps_a_heel_roll_out_of_the_slip(self):
        self.assertEqual(self.r["slip_ankle"], [0.04, 0.018])
        self.assertEqual(self.r["slip_ball"], [0.0, 0.018])
        self.assertEqual(self.r["lift"], [0.048, 0.0])

    def test_contact_definition_changes_the_slip(self):
        self.assertEqual(self.r["slip_height_only"], [0.0, 0.062642])

    def test_summary(self):
        s = self.r["summary"]
        self.assertEqual((s["ranges"], s["median"], s["p95"], s["worst"]), (2, 0.009, 0.018, 0.018))
        self.assertEqual([tuple(r) for r in s["over"]], [(21, 30)])
        self.assertEqual(self.r["empty"]["ranges"], 0)


if __name__ == "__main__":
    unittest.main()
