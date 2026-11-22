import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402


class MeasureSetTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.game = synth.art_set(self.dir / "jungle")

    def test_measures_the_lines_build_scene_needs(self):
        r = synth.run("measure_set.py", self.game, "--ground-h", "5")
        self.assertEqual(r.returncode, 0, r.stderr)
        values = json.loads(r.stdout)
        self.assertEqual(values["sea_horizon"], 0.5)
        self.assertEqual(values["ground_top"], round(0.3 + 0.1 / 5, 3))   # walkable line sunk 10 cm
        self.assertEqual(values["island_top_px"], 6)
        self.assertEqual(values["pedestal_top_px"], 10)
        self.assertEqual(values["jump_base_px"], 150)

    def test_names_a_missing_picture(self):
        (self.game / "island.png").unlink()
        r = synth.run("measure_set.py", self.game)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("island.png not found", r.stderr)

    def test_refuses_a_line_no_row_reaches(self):
        synth._sprite(self.game / "island.png", 192, 64, (0, 6, 80, 40))   # 42% wide, under the 60% line
        r = synth.run("measure_set.py", self.game)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("island.png", r.stderr)


class TraceHullsTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.game = synth.art_set(self.dir / "jungle")

    def test_hulls_are_normalized_and_bounds_planted(self):
        r = synth.run("trace_hulls.py", self.game)
        self.assertEqual(r.returncode, 0, r.stderr)
        shapes = json.loads((self.game / "shapes.json").read_text())
        for name in ("jar", "pot_round", "amphora", "idol", "coconut"):
            hull = shapes[name]["hull"]
            self.assertGreaterEqual(len(hull), 3, name)
            self.assertTrue(all(0 <= u <= 1 and 0 <= v <= 1 for u, v in hull), name)
        self.assertNotIn("hull", shapes["palm"])
        self.assertEqual(shapes["palm"]["bbox"], [36, 10, 59, 239])      # 16 empty rows under the trunk
        self.assertEqual((shapes["palm"]["w"], shapes["palm"]["h"]), (96, 256))

    def test_keeps_an_existing_file_without_force(self):
        self.assertEqual(synth.run("trace_hulls.py", self.game).returncode, 0)
        r = synth.run("trace_hulls.py", self.game)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--force", r.stderr)


if __name__ == "__main__":
    unittest.main()
