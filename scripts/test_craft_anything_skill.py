#!/usr/bin/env python3
"""Comprehensive test suite for the craft-anything agent skill, preflight, and project inspection."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = REPO_ROOT / ".agent-skills" / "craft-anything"
PREFLIGHT_PY = SKILL_DIR / "scripts" / "preflight.py"
PROJECT_INSPECT_PY = SKILL_DIR / "scripts" / "project_inspect.py"
SKILLS_JSON = REPO_ROOT / ".agent-skills" / "skills.json"
SETUP_PROMPT_MD = REPO_ROOT / "setup-all-skills-prompt.md"

AUDITED_COMMIT = "56aa31976b4ff0950e6b34ba020b0a568d2462fa"


class TestCraftAnythingPreflight(unittest.TestCase):
    """Tests for preflight.py offline host and source validation."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="craft-anything-preflight-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()

    def run_preflight(self, *args: str, env: dict[str, str] | None = None) -> tuple[int, dict[str, Any], str]:
        run_env = os.environ.copy()
        if env:
            run_env.update(env)
        proc = subprocess.run(
            [sys.executable, str(PREFLIGHT_PY), *args],
            cwd=str(self.work),
            env=run_env,
            capture_output=True,
            text=True,
            check=False,
        )
        data = {}
        if "--json" in args and proc.stdout.strip():
            try:
                data = json.loads(proc.stdout)
            except json.JSONDecodeError:
                pass
        return proc.returncode, data, proc.stderr

    def test_help_flag(self) -> None:
        code, _, err = self.run_preflight("--help")
        self.assertEqual(code, 0)
        self.assertEqual(err, "")

    def test_json_output_contract(self) -> None:
        code, data, _ = self.run_preflight("--json")
        self.assertIn(code, (0, 1))
        self.assertEqual(data.get("skill"), "craft-anything")
        self.assertEqual(data.get("scope"), "offline-preflight")
        self.assertFalse(data.get("runtime_verified"))
        self.assertIn(data.get("status"), ("ok", "blocked"))
        checks = data.get("checks", [])
        self.assertTrue(len(checks) >= 4)
        check_names = {c["name"] for c in checks}
        self.assertTrue(check_names.issuperset({"host", "python", "vcs", "rust"}))

    def test_expect_commit_without_repo_rejected(self) -> None:
        code, data, _ = self.run_preflight("--json", "--expect-commit", AUDITED_COMMIT)
        self.assertEqual(code, 2)
        self.assertEqual(data.get("status"), "error")

    def test_malformed_expect_commit_rejected(self) -> None:
        code, data, _ = self.run_preflight(
            "--json", "--repo", str(self.work), "--expect-commit", "not-a-sha"
        )
        self.assertEqual(code, 2)
        self.assertEqual(data.get("status"), "error")

    def test_missing_repo_path(self) -> None:
        missing = self.work / "does-not-exist"
        code, data, _ = self.run_preflight(
            "--json", "--repo", str(missing), "--expect-commit", AUDITED_COMMIT
        )
        self.assertEqual(code, 1)
        self.assertEqual(data.get("status"), "blocked")
        repo_check = next((c for c in data["checks"] if c["name"] == "repo"), None)
        self.assertIsNotNone(repo_check)
        self.assertEqual(repo_check["status"], "blocked")

    def test_valid_git_fixture_inspection(self) -> None:
        git_bin = shutil.which("git")
        if not git_bin:
            self.skipTest("git is required for fixture commit tests")

        repo = self.work / "mock-repo"
        repo.mkdir()
        for marker in (
            "README.md",
            "LICENSE-MIT",
            "LICENSE-APACHE",
            "Cargo.toml",
            "apps/craft-anything-cli/Cargo.toml",
            "crates/setup/src/skill.md",
        ):
            p = repo / marker
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("marker\n")

        subprocess.run([git_bin, "-C", str(repo), "init", "--quiet"], check=True)
        subprocess.run([git_bin, "-C", str(repo), "config", "user.name", "Tester"], check=True)
        subprocess.run([git_bin, "-C", str(repo), "config", "user.email", "test@invalid"], check=True)
        subprocess.run([git_bin, "-C", str(repo), "add", "."], check=True)
        subprocess.run([git_bin, "-C", str(repo), "commit", "--quiet", "-m", "init"], check=True)

        head_sha = subprocess.run(
            [git_bin, "-C", str(repo), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

        # Matching commit
        code, data, _ = self.run_preflight("--json", "--repo", str(repo), "--expect-commit", head_sha)
        self.assertIn(code, (0, 1))
        commit_check = next((c for c in data["checks"] if c["name"] == "repo_commit"), None)
        self.assertIsNotNone(commit_check)
        self.assertEqual(commit_check["status"], "ok")

        # Mismatched commit
        wrong_sha = "0" * 40
        code_wrong, data_wrong, _ = self.run_preflight("--json", "--repo", str(repo), "--expect-commit", wrong_sha)
        self.assertEqual(code_wrong, 1)
        commit_wrong = next((c for c in data_wrong["checks"] if c["name"] == "repo_commit"), None)
        self.assertIsNotNone(commit_wrong)
        self.assertEqual(commit_wrong["status"], "blocked")


class TestCraftAnythingProjectInspect(unittest.TestCase):
    """Tests for project_inspect.py inspect, validate, and init subcommands."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="craft-anything-inspect-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()

    def run_inspect(self, *args: str) -> tuple[int, dict[str, Any], str]:
        proc = subprocess.run(
            [sys.executable, str(PROJECT_INSPECT_PY), *args],
            cwd=str(self.work),
            capture_output=True,
            text=True,
            check=False,
        )
        data = {}
        if "--json" in args and proc.stdout.strip():
            try:
                data = json.loads(proc.stdout)
            except json.JSONDecodeError:
                pass
        return proc.returncode, data, proc.stderr

    def test_init_dry_run(self) -> None:
        dest = self.work / "test-project"
        code, data, _ = self.run_inspect(
            "init", str(dest),
            "--target", "https://example.com",
            "--request", "Recreate this site",
            "--dry-run",
            "--json",
        )
        self.assertEqual(code, 0)
        self.assertTrue(data.get("dry_run"))
        self.assertFalse(dest.exists())
        self.assertEqual(data["manifest"]["target"], "https://example.com")
        self.assertTrue(data["manifest"]["clean_room"])

    def test_init_real_and_inspect(self) -> None:
        dest = self.work / "real-project"
        code, data, _ = self.run_inspect(
            "init", str(dest),
            "--target", "https://example.com/demo",
            "--request", "Build a demo app",
            "--deep",
            "--backend", "Claude Code",
            "--json",
        )
        self.assertEqual(code, 0)
        self.assertTrue(dest.is_dir())
        self.assertTrue((dest / "craft.json").is_file())
        self.assertTrue((dest / "app").is_dir())
        self.assertTrue((dest / "checks").is_dir())
        self.assertFalse(data["manifest"]["clean_room"])  # deep was set

        # Now inspect it
        code_ins, data_ins, _ = self.run_inspect("inspect", str(dest), "--json")
        self.assertEqual(code_ins, 0)
        p = data_ins.get("project", {})
        self.assertEqual(p.get("project_type"), "rebuild")
        self.assertEqual(p.get("target"), "https://example.com/demo")
        self.assertEqual(p.get("request"), "Build a demo app")
        self.assertFalse(p.get("clean_room"))

    def test_validate_clean_project(self) -> None:
        dest = self.work / "clean-project"
        self.run_inspect(
            "init", str(dest),
            "--target", "https://example.com",
            "--request", "Clean project test",
            "--json",
        )
        code, data, _ = self.run_inspect("validate", str(dest), "--json")
        self.assertEqual(code, 0)
        self.assertEqual(data.get("status"), "ok")
        self.assertTrue(data.get("valid"))
        self.assertEqual(data.get("issues"), [])

    def test_validate_pending_approvals_blocks(self) -> None:
        dest = self.work / "approval-project"
        self.run_inspect(
            "init", str(dest),
            "--target", "https://example.com",
            "--request", "Project with pending approvals",
            "--json",
        )
        # Drop a pending approval in inbox
        inbox_card = dest / "inbox" / "approve_01.json"
        inbox_card.write_text(
            json.dumps({"kind": "core_action_approve", "status": "pending", "command": "npm install"})
        )

        code, data, _ = self.run_inspect("validate", str(dest), "--json")
        self.assertEqual(code, 1)
        self.assertEqual(data.get("status"), "blocked")
        self.assertFalse(data.get("valid"))
        self.assertTrue(any("pending approval" in issue for issue in data.get("issues", [])))

    def test_inspect_investigation_cany_project(self) -> None:
        cany_dir = self.work / "sample.cany"
        cany_dir.mkdir()
        (cany_dir / "project.toml").write_text(
            'name = "test-investigation"\npurpose = "security"\nformat_version = 1\n'
        )
        (cany_dir / "evidence").mkdir()
        (cany_dir / "evidence" / "ev_01.json").write_text('{"id":"ev_01"}\n')

        code, data, _ = self.run_inspect("inspect", str(cany_dir), "--json")
        self.assertEqual(code, 0)
        p = data.get("project", {})
        self.assertEqual(p.get("project_type"), "investigation")
        self.assertEqual(p.get("purpose"), "security")
        self.assertEqual(p.get("evidence_records"), 1)

    def test_invalid_init_target(self) -> None:
        dest = self.work / "invalid-target-project"
        code, data, _ = self.run_inspect(
            "init", str(dest),
            "--target", "invalid-target-format",
            "--request", "Valid request",
            "--json",
        )
        self.assertEqual(code, 1)
        self.assertEqual(data.get("status"), "error")


class TestCraftAnythingSkillIntegrity(unittest.TestCase):
    """Tests validating skill frontmatter, files, references, evals, and catalog projections."""

    def test_skill_document_exists_and_frontmatter_valid(self) -> None:
        skill_md = SKILL_DIR / "SKILL.md"
        self.assertTrue(skill_md.is_file(), "SKILL.md must exist")
        text = skill_md.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("---\n"), "SKILL.md must start with YAML frontmatter")

        # Parse YAML frontmatter
        import yaml
        parts = text.split("---", 2)
        self.assertGreaterEqual(len(parts), 3)
        fm = yaml.safe_load(parts[1])
        self.assertEqual(fm.get("name"), "craft-anything")
        desc = fm.get("description", "")
        self.assertTrue(isinstance(desc, str))
        self.assertGreaterEqual(len(desc.strip()), 25)
        self.assertLessEqual(len(desc.strip()), 1024)

        # Non-negotiable check: category/subcategory/tags must not be in SKILL.md frontmatter
        self.assertNotIn("category", fm, "category must live in skills.json only")
        self.assertNotIn("subcategory", fm, "subcategory must live in skills.json only")
        self.assertNotIn("tags", fm, "tags must live in skills.json only")

        meta = fm.get("metadata", {})
        self.assertEqual(meta.get("version"), "0.4.0")
        self.assertEqual(meta.get("source"), "https://github.com/storytold/craft-anything")
        self.assertEqual(meta.get("upstream_commit"), AUDITED_COMMIT)

    def test_references_and_scripts_exist(self) -> None:
        for ref_file in ("upstream.md", "cli-mcp.md", "rebuild-workflow.md", "recovery.md"):
            ref_path = SKILL_DIR / "references" / ref_file
            self.assertTrue(ref_path.is_file(), f"references/{ref_file} must exist")
            self.assertGreater(ref_path.stat().st_size, 100, f"references/{ref_file} must not be empty")

        for script_file in ("preflight.py", "project_inspect.py"):
            script_path = SKILL_DIR / "scripts" / script_file
            self.assertTrue(script_path.is_file(), f"scripts/{script_file} must exist")
            self.assertTrue(os.access(script_path, os.X_OK), f"scripts/{script_file} must be executable")

        evals_path = SKILL_DIR / "evals" / "evals.json"
        self.assertTrue(evals_path.is_file(), "evals/evals.json must exist")
        evals_data = json.loads(evals_path.read_text(encoding="utf-8"))
        self.assertEqual(evals_data.get("skill_name"), "craft-anything")
        self.assertEqual(len(evals_data.get("evals", [])), 5)

    def test_catalog_json_entry(self) -> None:
        manifest = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))
        skill = next((s for s in manifest["skills"] if s["name"] == "craft-anything"), None)
        self.assertIsNotNone(skill, "craft-anything must be in manifest.skills")
        assert skill is not None

        self.assertEqual(skill["category"], "cli-tools")
        self.assertEqual(skill["subcategory"], "developer-cli")
        self.assertEqual(skill["path"], "craft-anything/SKILL.md")
        self.assertEqual(skill["version"], "0.4.0")
        self.assertEqual(skill["source"], "https://github.com/storytold/craft-anything")

        self.assertIn("craft-anything", manifest["categories"]["cli-tools"])
        self.assertIn("craft-anything", manifest["subcategories"]["cli-tools"]["developer-cli"])

        # Relationship group
        rev_group = manifest.get("relationship_groups", {}).get("reverse-engineering-tools")
        self.assertIsNotNone(rev_group)
        assert rev_group is not None
        self.assertIn("craft-anything", rev_group.get("members", []))
        self.assertIn("rea", rev_group.get("members", []))

    def test_setup_all_skills_prompt_updated(self) -> None:
        text = SETUP_PROMPT_MD.read_text(encoding="utf-8")
        self.assertIn("craft-anything", text)
        self.assertIn("### Craft Anything reverse-engineering and rebuild engine", text)
        self.assertIn(AUDITED_COMMIT, text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
