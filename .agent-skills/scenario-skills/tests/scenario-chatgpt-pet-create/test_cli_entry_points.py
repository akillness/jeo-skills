import json
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402
from edge_fixtures import init_run, script  # noqa: E402


class EntryPointTests(unittest.TestCase):
    """Each script run as a process: a fixable problem exits 1 with a message, never a traceback."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = synth.tmpdir(cls)
        cls.run_dir = init_run(cls.tmp, 1)
        cls.small = cls.tmp / "small.png"
        synth.save(np.zeros((40, 30, 4), np.uint8), cls.small)

    def assert_error(self, result, message):
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn(message, result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_pet_prepare(self):
        result = script("pet_prepare.py", "init", "--name", "!!!", "--out", self.tmp / "unnamed")
        self.assert_error(result, "error: --id or --name must contain letters or digits")

    def test_pet_build(self):
        self.assert_error(script("pet_build.py", self.run_dir, "--rows", "bogus"), "error: not rows of a v1 sheet: bogus")

    def test_pet_package(self):
        self.assert_error(script("pet_package.py", "install", self.run_dir, "--codex-home", self.tmp / "home"), "has no pet.json")

    def test_pet_preview(self):
        self.assert_error(script("pet_preview.py", "contact", self.small, "--out", self.tmp / "c.png"), "is 30x40, not a pet sheet")

    def test_pet_frames(self):
        result = script("pet_frames.py", "split", self.small, "--out", self.tmp / "split")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(json.loads(result.stdout)["size"], [30, 40])

    def test_pet_check(self):
        result = script("pet_check.py", self.small, "--structure-only")
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report["ok"])
        self.assertIn("size 30x40; a pet sheet is 1536x1872 (v1) or 1536x2288 (v2)", report["errors"])


if __name__ == "__main__":
    unittest.main()
