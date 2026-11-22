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
import process_env as pe  # noqa: E402


class SeamlessTests(unittest.TestCase):
    def test_wraps_on_both_axes(self):
        im = Image.new("RGB", (100, 100))
        im.putdata([(x, y, 0) for y in range(100) for x in range(100)])  # red = x, green = y
        out = np.asarray(pe.seamless(im, 0.12)).astype(int)
        self.assertEqual(out.shape, (88, 88, 3))  # the 12 px tail is folded into the head
        # The first column starts on the tail and the last column ends just before it,
        # so the right edge flows into the left edge as it did in the source (87 -> 88).
        # The blend of the other axis can truncate a value by one (86.99 -> 86).
        for edge, value in ((out[:, 0, 0], 88), (out[:, -1, 0], 87), (out[0, :, 1], 88), (out[-1, :, 1], 87)):
            self.assertLessEqual(np.abs(edge - value).max(), 1)


class LevelsTests(unittest.TestCase):
    def test_count_and_lists(self):
        self.assertEqual(pe.parse_levels("2"), [1, 2])
        self.assertEqual(pe.parse_levels("2,"), [2])
        self.assertEqual(pe.parse_levels("4,2,4"), [2, 4])

    def test_bad_spec(self):
        with self.assertRaises(SystemExit):
            pe.parse_levels("two")


class ComponentsTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        self.sheet = Path(tmp) / "props.png"
        synth.props_sheet(self.sheet)

    def test_split_left_to_right(self):
        props = pe.components(synth.load(self.sheet), 3, 24)
        self.assertEqual([p.size for p in props], [(50, 90), (40, 50), (60, 70)])

    def test_largest_kept(self):
        props = pe.components(synth.load(self.sheet), 2, 24)
        self.assertEqual([p.size for p in props], [(50, 90), (60, 70)])


class CliTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.env = self.dir / "env"
        synth.env_level(self.env, 2)
        self.out = self.dir / "assets"

    def env_run(self, *extra):
        return synth.run("process_env.py", "--env", self.env, "--out", self.out, *extra)

    def test_level_outputs(self):
        r = self.env_run("--levels", "2,", "--tex-size", 64, "--ledge-height", 20, "--prop-height", 30)
        self.assertEqual(r.returncode, 0, r.stderr)
        names = sorted(p.name for p in self.out.iterdir())
        self.assertEqual(names, ["env_bg2.webp", "env_ledge2.webp", "env_mid2.webp", "env_prop2_0.webp",
                                 "env_prop2_1.webp", "env_prop2_2.webp", "env_tex2.webp"])
        self.assertEqual(synth.size(self.out / "env_tex2.webp"), (64, 64))
        self.assertEqual(synth.size(self.out / "env_ledge2.webp"), (100, 20))  # 200x40 opaque box, trimmed
        self.assertEqual(synth.size(self.out / "env_prop2_0.webp")[1], 30)
        self.assertEqual(synth.load(self.out / "env_mid2.webp").mode, "RGBA")

    def test_level_count_includes_missing_levels(self):
        r = self.env_run("--levels", "2", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"skip (missing) {self.env / 'bg1.png'}", r.stdout)
        self.assertIn("env_tex2.webp", r.stdout)

    def test_dry_run_writes_nothing(self):
        r = self.env_run("--levels", "2,", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("env_prop2_2.webp", r.stdout)
        self.assertFalse(self.out.exists())

    def test_force_needed_to_overwrite(self):
        self.assertEqual(self.env_run("--levels", "2,").returncode, 0)
        r = self.env_run("--levels", "2,")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("would overwrite", r.stderr)
        self.assertEqual(self.env_run("--levels", "2,", "--force").returncode, 0)

    def test_short_props_sheet_warns(self):
        r = synth.run("process_env.py", "--out", self.out, "--file", f"props={self.env / 'props2.png'}", "--props", 4)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("found 3 prop(s), expected 4", r.stderr)
        self.assertIn("held 3 of 4 props", r.stdout)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()),
                         ["env_prop_props2_0.webp", "env_prop_props2_1.webp", "env_prop_props2_2.webp"])

    def test_bad_file_kind(self):
        r = synth.run("process_env.py", "--out", self.out, "--file", f"sky={self.env / 'bg2.png'}")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("KIND=PATH", r.stderr)


if __name__ == "__main__":
    unittest.main()
