import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

sys.path.insert(0, str(synth.SCRIPTS))
import reframe_stills as rs  # noqa: E402


def figure_rows_cols(path):
    keep = ~rs.magenta_mask(np.array(synth.load(path).convert("RGB")).astype(int), 85)
    rows, cols = np.where(keep.any(1))[0], np.where(keep.any(0))[0]
    return rows.min(), rows.max(), cols.min(), cols.max()


class ReframeTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.still = self.dir / "hero_two_pose.png"
        synth.two_pose(self.still)
        self.out = self.dir / "frames"

    def reframe(self, *extra):
        return synth.run("reframe_stills.py", self.still, "--name", "hero", "--out", self.out, "--size", 200, *extra)

    def test_two_squares_on_one_feet_line(self):
        r = self.reframe()
        self.assertEqual(r.returncode, 0, r.stderr)
        base, fig_h = int(200 * 0.82), int(200 * 0.58)
        for pose in ("rest", "action"):
            path = self.out / f"hero_{pose}.png"
            self.assertEqual(synth.size(path), (200, 200))
            top, bottom, left, right = figure_rows_cols(path)
            self.assertIn(bottom, (base - 2, base - 1), pose)  # feet on the baseline
            self.assertLessEqual(abs((bottom - top + 1) - fig_h), 1, pose)  # figure height share
            self.assertLessEqual(abs((left + right) / 2 - 100), 1.5, pose)  # centered
        self.assertEqual(sorted(p.name for p in self.out.iterdir()), ["hero_action.png", "hero_rest.png"])

    def test_refuses_to_overwrite_without_force(self):
        self.assertEqual(self.reframe().returncode, 0)
        before = (self.out / "hero_rest.png").read_bytes()
        synth.two_pose(self.still, size=(400, 240))
        r = self.reframe()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("would overwrite", r.stderr)
        self.assertEqual((self.out / "hero_rest.png").read_bytes(), before)
        self.assertEqual(self.reframe("--force").returncode, 0)

    def test_errors_when_a_half_has_no_figure(self):
        Image.new("RGB", (400, 200), synth.MAGENTA).save(self.still)
        r = self.reframe()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no figure found in the rest half", r.stderr)
        self.assertFalse((self.out / "hero_rest.png").exists())

    def test_rejects_figure_below_baseline(self):
        r = self.reframe("--figure", "0.85", "--baseline", "0.8")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--baseline", r.stderr)


if __name__ == "__main__":
    unittest.main()
