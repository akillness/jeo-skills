#!/usr/bin/env python3
"""Tests for the connectonion skill: manifest entry, offline preflight, evals."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = REPO_ROOT / ".agent-skills" / "connectonion"
PREFLIGHT = SKILL_DIR / "scripts" / "preflight.py"
SKILLS_JSON = REPO_ROOT / ".agent-skills" / "skills.json"
SETUP_PROMPT = REPO_ROOT / "setup-all-skills-prompt.md"
PINNED = "90028ca1a3a64f3d74b68bef3c5732860ccd5a83"


class ConnectOnionSkillTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="connectonion-skill-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()

    def preflight(self, *args: str, path: str | None = None) -> tuple[int, dict]:
        env = {"HOME": str(self.work), "PATH": os.environ["PATH"] if path is None else path}
        proc = subprocess.run(
            [sys.executable, str(PREFLIGHT), *args],
            cwd=self.work, env=env, capture_output=True, text=True, timeout=30,
        )
        data = json.loads(proc.stdout) if "--json" in args and proc.stdout.strip() else {}
        return proc.returncode, data

    def test_manifest_entry_matches_skill_frontmatter(self) -> None:
        manifest = json.loads(SKILLS_JSON.read_text())
        entry = next(s for s in manifest["skills"] if s["name"] == "connectonion")
        self.assertEqual(entry["path"], "connectonion/SKILL.md")
        self.assertIn("connectonion", manifest["categories"][entry["category"]])
        self.assertIn("connectonion", manifest["subcategories"][entry["category"]][entry["subcategory"]])
        self.assertLessEqual(len(entry["description"]), 1024)
        text = (SKILL_DIR / "SKILL.md").read_text()
        self.assertIn(f"upstream_commit: {PINNED}", text)
        self.assertNotIn("\ncategory:", text.split("---")[1])

    def test_preflight_reports_state_dirs_without_reading_them(self) -> None:
        co_home = self.work / ".co"
        co_home.mkdir()
        (co_home / "keys.env").write_text("SECRET_TOKEN=do-not-leak\n")
        code, data = self.preflight("--json")
        self.assertIn(code, (0, 1))
        self.assertEqual(data["skill"], "connectonion")
        self.assertFalse(data["runtime_verified"])
        state = {c["name"]: c for c in data["checks"]}["state_co_home"]
        self.assertTrue(state["present"])
        self.assertNotIn("do-not-leak", json.dumps(data))

    def test_empty_path_blocks_with_no_install_route(self) -> None:
        code, data = self.preflight("--json", path="")
        self.assertEqual(code, 1)
        route = {c["name"]: c for c in data["checks"]}["install_route"]
        self.assertEqual(route["status"], "blocked")

    def test_any_install_route_on_path_is_enough(self) -> None:
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        shim = bin_dir / "uv"
        shim.write_text("#!/bin/sh\nexit 97\n")
        shim.chmod(0o755)
        code, data = self.preflight("--json", path=str(bin_dir))
        route = {c["name"]: c for c in data["checks"]}["install_route"]
        self.assertEqual(route["status"], "ok")
        self.assertEqual(Path(route["path"]).name, "uv")
        self.assertEqual(code, 0)

    def test_expect_commit_requires_repo_and_valid_sha(self) -> None:
        self.assertEqual(self.preflight("--json", "--expect-commit", PINNED)[0], 2)
        self.assertEqual(self.preflight("--json", "--repo", str(self.work), "--expect-commit", "abc")[0], 2)

    def test_repo_checkout_markers_and_pin_mismatch(self) -> None:
        repo = self.work / "checkout"
        for marker in ("README.md", "LICENSE", "pyproject.toml", "install.sh",
                       "connectonion/__init__.py", "connectonion/_version.py",
                       "connectonion/cli/__init__.py"):
            p = repo / marker
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("x\n")
        git = ["git", "-C", str(repo)]
        subprocess.run([*git, "init", "--quiet"], check=True)
        subprocess.run([*git, "-c", "user.name=t", "-c", "user.email=t@invalid", "add", "."], check=True)
        subprocess.run([*git, "-c", "user.name=t", "-c", "user.email=t@invalid", "commit", "--quiet", "-m", "i"], check=True)
        head = subprocess.run([*git, "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
        code, data = self.preflight("--json", "--repo", str(repo), "--expect-commit", head)
        self.assertEqual(code, 0, data)
        code, data = self.preflight("--json", "--repo", str(repo), "--expect-commit", PINNED)
        self.assertEqual(code, 1)
        (repo / "install.sh").unlink()
        code, _ = self.preflight("--json", "--repo", str(repo))
        self.assertEqual(code, 1)

    def test_evals_are_well_formed(self) -> None:
        evals = json.loads((SKILL_DIR / "evals" / "evals.json").read_text())
        self.assertEqual(evals["skill_name"], "connectonion")
        ids = [e["id"] for e in evals["evals"]]
        self.assertEqual(ids, sorted(set(ids)))
        for e in evals["evals"]:
            self.assertTrue(e["prompt"] and e["expected_output"] and e["assertions"])

    def test_skill_links_resolve(self) -> None:
        text = (SKILL_DIR / "SKILL.md").read_text()
        for target in re.findall(r"\]\((references/[^)#]+)\)", text):
            self.assertTrue((SKILL_DIR / target).is_file(), target)

    def test_setup_guide_documents_on_demand_boundary(self) -> None:
        guide = SETUP_PROMPT.read_text()
        self.assertIn(f"openonion/connectonion@{PINNED}", guide)
        self.assertIn("jeo-skill install connectonion --global --dry-run", guide)


if __name__ == "__main__":
    unittest.main(verbosity=2)
