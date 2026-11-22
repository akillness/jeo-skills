"""Runs bx_review.review() in a real Blender: culling=True shows a face pointing inward as a hole.

review_cases.py renders one box twice and writes the share of magenta background in each view.
Without Blender (the repository's script-tests job) every test skips; .github/workflows/blender.yml
installs Blender and runs them.
"""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from live_blender import BLENDER, SKIP

HERE = Path(__file__).parent
SCRIPTS = HERE.parents[1] / "skills" / "dcc" / "blender" / "scenario-blender-expert" / "scripts"


@unittest.skipIf(SKIP, SKIP)
class ReviewCulling(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tmp = tempfile.mkdtemp(prefix="bx_review_test_")
        out = Path(tmp) / "cases.json"
        run = subprocess.run(
            [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1",
             "-P", str(HERE / "review_cases.py"), "--", str(SCRIPTS), str(out), tmp],
            capture_output=True, text=True, timeout=600,
        )
        if run.returncode != 0:
            raise AssertionError(run.stdout[-3000:] + run.stderr[-3000:])
        cls.c = json.loads(out.read_text())
        shutil.rmtree(tmp, ignore_errors=True)

    def test_without_culling_the_box_reads_closed(self):
        self.assertTrue(self.c["plain"]["sheet"])
        self.assertEqual(self.c["plain"]["front"], 0)

    def test_culling_shows_the_inward_face_as_a_hole(self):
        self.assertTrue(self.c["culled"]["sheet"])
        # Seen through the culled front face, the box's other faces are back faces too.
        self.assertGreater(self.c["culled"]["front"], 0.2)
        # From the side the outward faces are drawn: only the background around the box shows.
        self.assertLess(self.c["culled"]["right"], self.c["culled"]["front"])

    def test_command_line_renders_with_culling(self):
        self.assertGreater(self.c["cli"]["front"], 0.2)

    def test_user_scene_untouched(self):
        self.assertFalse(self.c["scene_culling_after"])  # review() leaves the scene as it found it


if __name__ == "__main__":
    unittest.main()
