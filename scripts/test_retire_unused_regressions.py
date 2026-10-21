#!/usr/bin/env python3
"""Black-box catalog retirement regression tests.

Run: python3 scripts/test_retire_unused_regressions.py -v
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
PROTECTED_BUNDLES = ("starter", "cli-core", "infrastructure-core")
FAKE_JEV = """#!/usr/bin/env python3
import os
from pathlib import Path
Path(os.environ['JEO_FAKE_JEV_LOG']).open('a').write('invoked\\n')
raise SystemExit(0)
"""


class RetirementRegressions(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jeo-retire-regressions-")
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.repo = self.work / "repo"
        self.home = self.work / "home"
        self.state = self.work / "state"
        self.repo.mkdir()
        self.home.mkdir()
        self.state.mkdir()
        shutil.copytree(ROOT / ".agent-skills", self.repo / ".agent-skills", symlinks=True)
        (self.repo / "scripts").mkdir()
        for filename in (
            "retire-unused-skills.py",
            "validate-catalog-projections.py",
            "generate-catalog-projections.py",
            "frontmatter_boundary.py",
        ):
            shutil.copy2(ROOT / "scripts" / filename, self.repo / "scripts" / filename)
        shutil.copy2(
            ROOT / ".agent-skills/jeo-skill/scripts/skill_jev.py",
            self.repo / ".agent-skills/jeo-skill/scripts/skill_jev.py",
        )
        for filename in ("README.md", "README.ko.md", "README.es-ES.md"):
            shutil.copy2(ROOT / filename, self.repo / filename)
        self.fake_jev = self.work / "fake-jev.py"
        self.fake_jev.write_text(FAKE_JEV, encoding="utf-8")
        self.fake_jev.chmod(0o700)
        self.fake_jev_log = self.work / "jev-calls.log"
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "XDG_STATE_HOME": str(self.state / "xdg"),
            "JEO_SKILL_STATE_DIR": str(self.state / "jeo-state"),
            "JEO_SKILLS_CATALOG": str(self.repo / ".agent-skills" / "skills.json"),
            "PYTHONDONTWRITEBYTECODE": "1",
            "JEO_SKILL_JEV_HARNESS": str(self.fake_jev),
            "JEO_FAKE_JEV_LOG": str(self.fake_jev_log),
        }

    def run_retire(self, report: dict, *args: str) -> subprocess.CompletedProcess[str]:
        report_path = self.work / "usage-report.json"
        report_path.write_text(json.dumps(report), encoding="utf-8")
        return subprocess.run(
            [
                sys.executable,
                str(self.repo / "scripts" / "retire-unused-skills.py"),
                "--repo-root",
                str(self.repo),
                "--usage-report",
                str(report_path),
                *args,
            ],
            cwd=self.repo,
            env=self.env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
        )

    def manifest(self) -> dict:
        return json.loads((self.repo / ".agent-skills/skills.json").read_text(encoding="utf-8"))

    def manifest_names(self) -> list[str]:
        return [entry["name"] for entry in self.manifest()["skills"]]

    def snapshot(self) -> dict[str, bytes]:
        return {
            str(path.relative_to(self.repo)): path.read_bytes()
            for path in self.repo.rglob("*")
            if path.is_file()
        }

    def report_for(self, *names: str) -> dict:
        return {
            "version": 1,
            "generated_at": "2026-10-21T00:00:00+00:00",
            "tracking_started_at": "2026-09-01T00:00:00+00:00",
            "grace_days": 30,
            "sources": {"fixture": {"available": True, "records": 0, "window": [None, None], "error": None}},
            "skills": [
                {
                    "name": name,
                    "status": "candidate",
                    "count": 0,
                    "last_used_at": None,
                    "by_source": {},
                    "grace_ends_at": "2026-10-01T00:00:00+00:00",
                    "protected_reason": None,
                }
                for name in names
            ],
        }

    def candidate(self) -> str:
        result = self.run_retire(self.report_for(*self.manifest_names()), "--json")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for proposal in json.loads(result.stdout)["proposals"]:
            if not proposal["live_references"] and not proposal["bundles"]:
                return proposal["name"]
        self.fail("fixture catalog did not contain an unreferenced unbundled candidate")

    def test_dry_run_json_shape_and_zero_bytes_changed(self):
        candidate = self.candidate()
        before = self.snapshot()
        result = self.run_retire(self.report_for(candidate), "--json")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["dry_run"])
        self.assertEqual(payload["repo_root"], str(self.repo.resolve()))
        self.assertEqual([row["name"] for row in payload["proposals"]], [candidate])
        retirement = payload["proposals"][0]["proposed_retirement"]
        self.assertTrue(retirement["replacement"])
        self.assertIn(retirement["replacement_type"], {"skill", "workflow"})
        self.assertTrue(retirement["reason"])
        self.assertEqual(self.snapshot(), before)

    def test_protected_bundle_members_and_router_are_never_proposed(self):
        manifest = self.manifest()
        protected = {"jeo-skill"}
        for bundle in PROTECTED_BUNDLES:
            protected.update(manifest.get("bundles", {}).get(bundle, []))
        protected &= set(self.manifest_names())
        result = self.run_retire(self.report_for(*sorted(protected)), "--json")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["proposals"], [])

    def test_apply_retirement_passes_projections_and_records_replacement(self):
        candidate = self.candidate()
        result = self.run_retire(
            self.report_for(candidate),
            "--apply",
            "--approve",
            candidate,
            "--skip-jev-review",
            "--json",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        self.assertFalse(payload["dry_run"])
        self.assertEqual(payload["retired"], [candidate])
        retirement = self.manifest()["retired_skills"][candidate]
        self.assertTrue(retirement["replacement"])
        self.assertIn(retirement["replacement_type"], {"skill", "workflow"})
        self.assertTrue(retirement["reason"])
        self.assertFalse((self.repo / ".agent-skills" / candidate).exists())
        for script, extra in (
            ("validate-catalog-projections.py", ()),
            ("generate-catalog-projections.py", ("--check",)),
        ):
            checked = subprocess.run(
                [sys.executable, str(self.repo / "scripts" / script), "--repo-root", str(self.repo), *extra],
                cwd=self.repo,
                env=self.env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=120,
            )
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)

    def test_non_candidate_and_live_reference_approvals_fail_without_writes(self):
        candidate = self.candidate()
        for report in (self.report_for("not-candidate"), self.report_for(candidate)):
            with self.subTest(report_names=[row["name"] for row in report["skills"]]):
                if report["skills"][0]["name"] == candidate:
                    others = [name for name in self.manifest_names() if name != candidate]
                    self.assertTrue(others)
                    with (self.repo / ".agent-skills" / others[0] / "SKILL.md").open("a", encoding="utf-8") as handle:
                        handle.write(f"\nSee `{candidate}` for related guidance.\n")
                before = self.snapshot()
                result = self.run_retire(report, "--apply", "--approve", candidate, "--skip-jev-review", "--json")
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.snapshot(), before)

    def test_validator_failure_rolls_back_byte_identically(self):
        candidate = self.candidate()
        validator = self.repo / "scripts" / "validate-catalog-projections.py"
        validator.write_text("#!/usr/bin/env python3\nraise SystemExit(17)\n", encoding="utf-8")
        before = self.snapshot()
        result = self.run_retire(self.report_for(candidate), "--apply", "--approve", candidate, "--skip-jev-review", "--json")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.snapshot(), before)
        self.assertTrue((self.repo / ".agent-skills" / candidate).is_dir())

    def test_malformed_reports_are_rejected_with_exit_two(self):
        malformed = [
            {"skills": {"candidate": {"status": "candidate"}}},
            {"skills": [{"name": "candidate", "status": "candidate"}, {"name": "candidate", "status": "candidate"}]},
        ]
        before = self.snapshot()
        for report in malformed:
            with self.subTest(report=report):
                result = self.run_retire(report, "--json")
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertEqual(self.snapshot(), before)

    def test_jev_gate_requires_allow_remote_before_harness_and_writes(self):
        candidate = self.candidate()
        before = self.snapshot()
        result = self.run_retire(
            self.report_for(candidate),
            "--apply",
            "--approve",
            candidate,
            "--jev-profile",
            "fixture",
            "--json",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("allow-remote", result.stderr)
        self.assertFalse(self.fake_jev_log.exists() and self.fake_jev_log.read_text(encoding="utf-8"))
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
