#!/usr/bin/env python3
"""Offline unit tests for the GameFactory-3A operator skill and preflight helper.

Run: python3 -B scripts/test_gamefactory_3a.py -v
Only synthetic public bytes and the copied helper are executed; zero network
access, engine execution, or model downloads required.
"""
from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills/gamefactory-3a/scripts/preflight.py"
MANIFEST = ROOT / ".agent-skills/gamefactory-3a/references/source.json"
TOOLS = ("python3", "git", "blender", "node", "claude", "bash")


class GameFactory3APreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="gamefactory-3a-test-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name).resolve()
        self.package = self.work / "gamefactory-3a"
        (self.package / "scripts").mkdir(parents=True)
        (self.package / "references").mkdir()
        self.helper = self.package / "scripts/preflight.py"
        shutil.copyfile(HELPER, self.helper)
        self.manifest_path = self.package / "references/source.json"
        shutil.copyfile(MANIFEST, self.manifest_path)

    def run_helper(self, *args: str) -> tuple[int, dict, str]:
        cmd = [sys.executable, str(self.helper), *args]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        data = json.loads(proc.stdout) if proc.stdout.strip() else {}
        return proc.returncode, data, proc.stderr

    def test_offline_inventory_succeeds(self):
        code, data, stderr = self.run_helper("--json")
        self.assertEqual(code, 0, f"Expected 0, got {code}: {stderr}")
        self.assertEqual(data.get("skill"), "gamefactory-3a")
        self.assertEqual(data.get("repository"), "OpenDCAI/GameFactory-3A")
        self.assertEqual(data.get("license"), "Apache-2.0")
        self.assertFalse(data.get("runtime_verified"))
        self.assertFalse(data.get("whole_revision_verified"))
        tools = {t["name"]: t for t in data.get("tools", [])}
        for tool in TOOLS:
            self.assertIn(tool, tools)

    def test_plain_output_succeeds(self):
        cmd = [sys.executable, str(self.helper)]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        self.assertEqual(proc.returncode, 0)
        self.assertIn("Skill: gamefactory-3a", proc.stdout)
        self.assertIn("Repository: OpenDCAI/GameFactory-3A", proc.stdout)

    def test_repo_comparison_detects_mismatch(self):
        fake_repo = self.work / "fake_repo"
        fake_repo.mkdir()
        (fake_repo / "README.md").write_text("corrupted content", encoding="utf-8")
        code, data, _ = self.run_helper("--repo", str(fake_repo), "--json")
        self.assertEqual(code, 1)
        comp = data.get("source_comparison", {})
        self.assertFalse(comp.get("all_matched"))

    def test_relative_repo_path_rejected(self):
        cmd = [sys.executable, str(self.helper), "--repo", "relative/path"]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        self.assertEqual(proc.returncode, 2)
        self.assertIn("absolute_repo_path_required", proc.stderr)


if __name__ == "__main__":
    unittest.main()
