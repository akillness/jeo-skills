"""wildcard.py run as a script: exit codes and output through the __main__ entry point."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest

SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "skills",
    "scenario-inspiration",
    "scripts",
    "wildcard.py",
)


def run(*args):
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True)


class EntryPointTest(unittest.TestCase):
    def test_json_draw_exits_zero_and_repeats_for_a_seed(self):
        first = run("--seed", "7", "--count", "2", "--json")
        second = run("--seed", "7", "--count", "2", "--json")
        self.assertEqual(first.returncode, 0, first.stderr)
        payload = json.loads(first.stdout)
        self.assertEqual(payload["seed"], 7)
        self.assertEqual(len(payload["cards"]), 2)
        self.assertEqual(first.stdout, second.stdout)

    def test_an_impossible_count_exits_two_with_usage(self):
        result = run("--count", "0")
        self.assertEqual(result.returncode, 2)
        self.assertIn("usage:", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
