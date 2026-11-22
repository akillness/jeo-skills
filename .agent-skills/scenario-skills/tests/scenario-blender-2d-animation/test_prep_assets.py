import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402


class CutTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.sheet = self.dir / "props.png"
        self.out = self.dir / "game"

    def test_names_follow_reading_order(self):
        synth.props_sheet(self.sheet)
        r = synth.run("prep_assets.py", "cut", self.sheet, self.out, "wide,tall,round")
        self.assertEqual(r.returncode, 0, r.stderr)
        for name, size in (("wide", (140, 60)), ("tall", (60, 100)), ("round", (100, 100))):
            ys, xs = np.where(synth.alpha(self.out / f"{name}.png") > 16)
            self.assertEqual((np.ptp(xs) + 1, np.ptp(ys) + 1), size, name)
        self.assertNotIn("WARNING", r.stdout)

    def test_drops_specks_and_warns_on_a_count_mismatch(self):
        synth.props_sheet(self.sheet, speck=True)
        r = synth.run("prep_assets.py", "cut", self.sheet, self.out, "wide,tall,round,extra")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("found 3 sprites for 4 names", r.stdout)
        self.assertFalse((self.out / "extra.png").exists())

    def test_refuses_to_overwrite_without_force(self):
        synth.props_sheet(self.sheet)
        self.assertEqual(synth.run("prep_assets.py", "cut", self.sheet, self.out, "wide,tall,round").returncode, 0)
        r = synth.run("prep_assets.py", "cut", self.sheet, self.out, "wide,tall,round")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--force", r.stderr)
        r = synth.run("prep_assets.py", "cut", self.sheet, self.out, "wide,tall,round", "--force")
        self.assertEqual(r.returncode, 0, r.stderr)


class KeyTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.still = self.dir / "hero_action.png"
        self.out = self.dir / "hero_jump.png"
        synth.magenta_still(self.still)

    def test_keys_magenta_and_keeps_enclosed_pink(self):
        r = synth.run("prep_assets.py", "key", self.still, self.out)
        self.assertEqual(r.returncode, 0, r.stderr)
        a = synth.alpha(self.out)
        self.assertEqual(a[5, 5], 0)            # background
        self.assertEqual(a[100, 60], 255)       # figure
        self.assertEqual(a[70, 80], 255)        # pink inner ear, enclosed by the figure
        self.assertEqual(a[120, 120], 0)        # pure magenta seen through the figure

    def test_refuses_to_overwrite_its_input_or_an_output(self):
        r = synth.run("prep_assets.py", "key", self.still, self.still)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("overwrite the input", r.stderr)
        self.assertEqual(synth.run("prep_assets.py", "key", self.still, self.out).returncode, 0)
        r = synth.run("prep_assets.py", "key", self.still, self.out)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--force", r.stderr)


class TileTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.layer = self.dir / "jungle.png"
        self.out = self.dir / "jungle_tile.png"
        synth.wide_layer(self.layer)

    def test_joins_the_two_ends_without_a_seam_or_a_ghost(self):
        r = synth.run("prep_assets.py", "tile", self.layer, self.out, 64)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(synth.size(self.out), (400 - 64, 120))
        a = synth.alpha(self.out)
        self.assertTrue((a[100] == 255).all())          # the strip still runs edge to edge
        self.assertFalse(((a > 0) & (a < 255)).any())   # no half-transparent ghost anywhere
        tower = np.where(a[12] > 0)[0]
        self.assertEqual(list(tower), list(range(150, 171)))   # the middle landmark is whole
        for row, cols in ((32, slice(44, 64)), (75, slice(20, 41))):   # the end tree, the bush
            piece = a[row, cols]
            self.assertTrue(piece.all() or not piece.any())    # whole or gone, never cut
        red = synth.pixels(self.out)[100, :, 0].astype(int)
        steps = np.abs(np.diff(np.append(red, red[0])))     # every column step, the repeat included
        self.assertLess(steps.max(), 8)                 # the raw ends (red 30 and 230) never meet unblended

    def test_usage_without_arguments(self):
        r = synth.run("prep_assets.py")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("prep_assets.py cut", r.stderr)


if __name__ == "__main__":
    unittest.main()
