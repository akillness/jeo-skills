"""Runs bx_rig's ARKit and viseme helpers in a real Blender on a face with planted keys.

face_cases.py builds the face, exports it to FBX and GLB, re-imports both and writes the
results to JSON; these tests read them. Without Blender every test skips.
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
class FaceShapes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_face_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "face_cases.py"), "--", str(SCRIPTS), str(out), tmp],
            capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.r = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def test_report_finds_missing_and_wrong_case(self):
        r = self.r["before"]
        self.assertEqual(r["expected"], 52)
        self.assertEqual(r["present"], 3)  # JawOpen counts under wrong_case
        self.assertEqual(len(r["missing"]), 48)
        self.assertEqual(r["wrong_case"], {"JawOpen": "jawOpen"})
        self.assertEqual(r["extra"], ["customKey"])

    def test_shape_set_fills_the_set_at_value_zero(self):
        self.assertEqual(len(self.r["created"]), 48)
        self.assertNotIn("jawOpen", self.r["created"])  # renamed, not recreated
        self.assertEqual(self.r["created_values"], [0.0])
        self.assertEqual(self.r["second_call"], [])

    def test_report_after_set(self):
        r = self.r["after"]
        self.assertEqual((r["present"], r["missing"], r["wrong_case"]), (52, [], {}))
        self.assertEqual(len(r["empty"]), 47)
        for name in ("eyeBlinkLeft", "eyeBlinkRight", "jawLeft", "jawOpen", "mouthSmileLeft"):
            self.assertNotIn(name, r["empty"])

    def test_sides(self):
        r = self.r["after"]
        self.assertEqual(self.r["unmatched"], 0)  # the sphere is symmetric across X
        self.assertEqual(r["left_is"], "+X")
        self.assertEqual(r["side_conflicts"], ["mouthSmileLeft"])

    def test_sides_on_a_whole_body(self):
        r = self.r["body"]
        self.assertEqual(r["left_is"], "+X")
        self.assertEqual(r["side_conflicts"], [])

    def test_visemes(self):
        self.assertEqual(self.r["visemes_created"], ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS",
                                                     "nn", "RR", "aa", "E", "I", "O", "U"])
        r = self.r["visemes"]
        self.assertEqual((r["present"], len(r["empty"]), r["left_is"]), (15, 15, None))

    def test_names_sides_and_empty_keys_survive_export(self):
        for fmt in ("fbx", "glb"):
            with self.subTest(fmt=fmt):
                r = self.r[fmt]["report"]
                self.assertEqual((r["present"], r["missing"]), (52, []))
                self.assertEqual(len(r["empty"]), 47)
                self.assertEqual(r["left_is"], "+X")
                self.assertEqual(r["side_conflicts"], ["mouthSmileLeft"])
                self.assertIn("sil", self.r[fmt]["keys"])

    def test_mesh_without_keys(self):
        r = self.r["bare"]
        self.assertEqual((r["present"], len(r["missing"]), r["left_is"]), (0, 52, None))


if __name__ == "__main__":
    unittest.main()
