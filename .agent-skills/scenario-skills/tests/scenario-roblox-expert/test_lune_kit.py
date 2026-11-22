"""Runs the Lune tests in lune/ (AgentKit modules under fake engine services) when Lune is installed.

Each test prints one line per check and errors on any failure. CI has no Lune, so they skip there.
"""

import pathlib
import shutil
import subprocess
import unittest

HERE = pathlib.Path(__file__).parent
REPO = HERE.parents[1]


@unittest.skipUnless(shutil.which("lune"), "needs lune (0.11.0, as scenario-roblox-tooling pins)")
class LuneKit(unittest.TestCase):
    def test_every_lune_test_passes(self):
        tests = sorted((HERE / "lune").glob("*.luau"))
        self.assertTrue(tests)
        for test in tests:
            with self.subTest(test=test.name):
                run = subprocess.run(["lune", "run", str(test.relative_to(REPO))], cwd=REPO,
                                     capture_output=True, text=True, timeout=120)
                self.assertEqual(run.returncode, 0, run.stdout + run.stderr)


if __name__ == "__main__":
    unittest.main()
