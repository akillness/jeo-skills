"""scripts/bug_report.sh: the bug report each agent tries to reproduce."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAKE_GH = """#!/usr/bin/env bash
echo "$*" >> "$GH_CALLS"
printf '# bug: Tabs crash\\n\\nReported in https://github.com/o/r/issues/12\\n\\nOpen the app, tap Send.\\n'
"""


class BugReport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd, bin_dir = Path(self.tmp.name, "work"), Path(self.tmp.name, "bin")
        self.cwd.mkdir()
        bin_dir.mkdir()
        (bin_dir / "gh").write_text(FAKE_GH)
        (bin_dir / "gh").chmod(0o755)
        self.calls = Path(self.tmp.name, "calls.txt")
        self.env = dict(os.environ, PATH=f"{bin_dir}{os.pathsep}{os.environ['PATH']}", GH_CALLS=str(self.calls))

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, report):
        return subprocess.run(["bash", str(ROOT / "scripts/bug_report.sh")], cwd=self.cwd,
                              env=dict(self.env, BUG_REPORT=report), capture_output=True, text=True)

    def gh_calls(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def test_issue_reference_is_read_with_gh(self):
        out = self.run_script("o/r#12")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertTrue(self.gh_calls()[0].startswith("api repos/o/r/issues/12 --jq "))
        text = (self.cwd / "bug_report.md").read_text()
        self.assertTrue(text.startswith("# bug: Tabs crash"))
        self.assertEqual((self.cwd / "results/bug_report.md").read_text(), text)

    def test_issue_url_is_read_with_gh(self):
        out = self.run_script("https://github.com/some-org/my.app/issues/345")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertTrue(self.gh_calls()[0].startswith("api repos/some-org/my.app/issues/345 "))

    def test_plain_text_is_kept_as_is_and_never_printed(self):
        report = "Open Settings\nTap Language twice: the app closes"
        out = self.run_script(report)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(self.gh_calls(), [])
        self.assertEqual((self.cwd / "bug_report.md").read_text(), report + "\n")
        self.assertNotIn("Language", out.stdout + out.stderr)   # public logs
        self.assertIn("Bug report ready (2 lines)", out.stdout)

    def test_text_that_only_looks_like_a_reference_is_text(self):
        out = self.run_script("crash after o/r#12 is fixed")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(self.gh_calls(), [])

    def test_empty_report_fails(self):
        self.assertNotEqual(self.run_script("").returncode, 0)


if __name__ == "__main__":
    unittest.main()
