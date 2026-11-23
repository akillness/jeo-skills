"""scripts/compare.py: the same personas on two versions of an app."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import compare  # noqa: E402

A = {
    "anna": {"score": 5, "goal_reached": "no", "actions": 30, "issues": [
        {"title": "Continue hidden by keyboard", "severity": "blocker"},
        {"title": "Typo on home", "severity": "cosmetic"}],
        "improvements": [{"title": "Shorter sign-up", "area": "onboarding"}]},
    "noah": {"score": 7, "goal_reached": "yes", "actions": 14, "issues": [
        {"title": "Typo on home", "severity": "cosmetic"}]},
    "kenji": {"score": 6, "issues": []},
}
B = {
    "anna": {"score": 7, "goal_reached": "yes", "actions": 18, "issues": [
        {"title": "typo on home", "severity": "cosmetic"}, {"title": "Price unclear", "severity": "major"}],
        "improvements": [{"title": "Show the price", "area": "Trust"}, {"title": "Odd one", "area": "weird"},
                         {"area": "copy"}]},
    "noah": {"score": 7, "goal_reached": "partly", "actions": 20, "issues": []},
    "olga": {"score": 9, "issues": []},
}


def write_run(base, findings):
    for persona, data in findings.items():
        d = Path(base, persona, "results", persona)
        d.mkdir(parents=True)
        (d / "findings.json").write_text(json.dumps(data), encoding="utf-8")


class Compare(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.a, self.b = Path(self.tmp.name, "a"), Path(self.tmp.name, "b")
        write_run(self.a, A)
        write_run(self.b, B)
        self.md = compare.render(compare.load(self.a), compare.load(self.b))

    def tearDown(self):
        self.tmp.cleanup()

    def test_overview_table(self):
        for row in ("| Personas | 3 | 3 |",
                    "| Goal reached (yes / partly / no) | 1 / 0 / 1 | 1 / 1 / 0 |",
                    "| Median actions | 22 | 19 |",
                    "| Average score | 6.0/10 | 7.7/10 |",
                    "| Issues (blocker / major / minor / cosmetic) | 1 / 0 / 0 / 2 | 0 / 1 / 0 / 1 |"):
            self.assertIn(row, self.md)
        self.assertIn("They do not predict which version converts better", self.md)

    def test_personas_on_one_version_only_are_left_out_of_the_pairs(self):
        self.assertIn("2 personas ran both.", self.md)
        self.assertIn("Only on one version, so not in the persona table: kenji, olga.", self.md)
        self.assertIn("B scored higher than A for 1 of 2 personas, lower for 0, the same for 1.", self.md)

    def test_issues_seen_on_one_version_only(self):
        only_a = self.md.split("## Issues seen only on A")[1].split("## Issues seen only on B")[0]
        self.assertIn("- blocker: Continue hidden by keyboard (anna)", only_a)
        self.assertNotIn("Typo", only_a)   # same title on B, case aside
        self.assertIn("- major: Price unclear (anna)", self.md.split("## Issues seen only on B")[1])

    def test_improvements_by_area(self):
        for row in ("| onboarding | 1 | 0 |", "| trust | 0 | 1 |", "| other | 0 | 1 |"):
            self.assertIn(row, self.md)
        self.assertNotIn("| copy |", self.md)   # no title: not an improvement

    def test_empty_runs(self):
        md = compare.render({}, {})
        self.assertIn("0 personas ran both.", md)
        self.assertEqual(md.count("None."), 2)

    def test_command_line_with_names(self):
        out = subprocess.run([sys.executable, str(ROOT / "scripts/compare.py"), str(self.a), str(self.b),
                              "main", "new-onboarding"], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertTrue(out.stdout.startswith("# main vs new-onboarding\n"))
        self.assertIn("| Score main | Score new-onboarding |", out.stdout)


if __name__ == "__main__":
    unittest.main()
