#!/usr/bin/env python3
"""Black-box offline preflight contracts; never execute upstream software."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills/elephant-goldfish-model/scripts/preflight.py"
SKILLS = ("brainstorm", "draft", "resolve", "bootstrap", "review", "review-loop", "drift-report")


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="egm-preflight-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.marker = self.root / "executed"
        for name in ("git", "curl", "wget", "node", "npm", "npx", "claude", "codex", "gemini", "python", "python3"):
            tool = self.bin / name
            tool.write_text(f"#!/bin/sh\ntouch '{self.marker}'\nexit 99\n", encoding="utf-8")
            tool.chmod(0o755)
        self.env = {"PATH": str(self.bin), "HOME": str(self.home), "PYTHONDONTWRITEBYTECODE": "1"}
        self.checkout = self.root / "checkout with spaces"
        self.checkout.mkdir()

    def run_helper(self, *args):
        return subprocess.run([sys.executable, "-B", str(HELPER), *args], env=self.env,
                              capture_output=True, text=True, timeout=10)

    def report(self, *args):
        result = self.run_helper("--checkout", str(self.checkout), "--json", *args)
        self.assertNotIn("Traceback", result.stderr)
        return result, json.loads(result.stdout)

    def fixture(self):
        for path in ["plugin.json", *(f"skills/egm-{name}/SKILL.md" for name in SKILLS)]:
            target = self.checkout / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("fixture\n", encoding="utf-8")
        for path in ("agents", "resources/document_standards", "docs"):
            (self.checkout / path).mkdir(parents=True, exist_ok=True)

    def test_complete_inventory_is_read_only_and_offline(self):
        self.fixture()
        secret = self.home / ".credentials"
        secret.write_text("UNIQUE_SECRET_DO_NOT_PRINT", encoding="utf-8")
        before = {p.relative_to(self.checkout): p.read_bytes() for p in self.checkout.rglob("*") if p.is_file()}
        result, report = self.report()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(report["skill"], "elephant-goldfish-model")
        self.assertEqual(report["scope"], "offline-preflight")
        self.assertEqual(report["checkout"], str(self.checkout.resolve()))
        self.assertEqual(report["status"], "ok")
        self.assertIs(report["runtime_verified"], False)
        self.assertTrue(report["checks"])
        self.assertTrue(all(check["status"] == "ok" for check in report["checks"]))
        self.assertNotIn("UNIQUE_SECRET_DO_NOT_PRINT", result.stdout + result.stderr)
        self.assertFalse(self.marker.exists())
        self.assertEqual([p.name for p in self.home.iterdir()], [".credentials"])
        self.assertEqual(before, {p.relative_to(self.checkout): p.read_bytes() for p in self.checkout.rglob("*") if p.is_file()})

    def test_every_required_skill_is_reported_missing_individually(self):
        self.fixture()
        for name in SKILLS:
            path = self.checkout / f"skills/egm-{name}/SKILL.md"
            with self.subTest(skill=name):
                path.unlink()
                result, report = self.report()
                self.assertEqual(result.returncode, 1)
                self.assertEqual(report["status"], "blocked")
                self.assertIs(report["runtime_verified"], False)
                self.assertIn({"path": str(path.relative_to(self.checkout)), "status": "missing"}, report["checks"])
                path.write_text("fixture\n", encoding="utf-8")

    def test_missing_checkout_and_file_path_are_blocked(self):
        for path in (self.root / "absent", self.root / "regular-file"):
            if path.name == "regular-file":
                path.write_text("not a directory", encoding="utf-8")
            with self.subTest(path=path):
                result = self.run_helper("--checkout", str(path), "--json")
                self.assertEqual(result.returncode, 1, result.stderr)
                report = json.loads(result.stdout)
                self.assertEqual(report["status"], "blocked")
                self.assertIs(report["runtime_verified"], False)
        self.assertFalse(self.marker.exists())

    def test_missing_manifest_and_directories_are_blocked(self):
        self.fixture()
        for relative in ("plugin.json", "agents", "resources/document_standards", "docs"):
            path = self.checkout / relative
            with self.subTest(path=relative):
                if path.is_dir():
                    path.rmdir()
                else:
                    path.unlink()
                result, report = self.report()
                self.assertEqual(result.returncode, 1)
                self.assertIn({"path": relative, "status": "missing"}, report["checks"])
                if path.suffix:
                    path.write_text("fixture\n", encoding="utf-8")
                else:
                    path.mkdir()

    def test_cyclic_and_external_marker_symlinks_are_blocked(self):
        self.fixture()
        marker = self.checkout / "plugin.json"
        marker.unlink()
        external = self.root / "external.json"
        external.write_text("external\n", encoding="utf-8")
        for target in ("plugin.json", str(external)):
            with self.subTest(target=target):
                marker.symlink_to(target)
                result, report = self.report()
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertEqual(report["status"], "blocked")
                self.assertIn({"path": "plugin.json", "status": "missing"}, report["checks"])
                marker.unlink()
        self.assertFalse(self.marker.exists())

    def test_installed_copy_runs_from_unrelated_directory(self):
        self.fixture()
        installed = self.root / "installed" / "scripts" / "preflight.py"
        installed.parent.mkdir(parents=True)
        installed.write_bytes(HELPER.read_bytes())
        result = subprocess.run([sys.executable, "-B", str(installed), "--checkout",
                                 str(self.checkout), "--json"], cwd=self.home, env=self.env,
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "ok")
        self.assertFalse(self.marker.exists())

    def test_bad_arguments_fail_without_running_tools(self):
        for args in ((), ("--checkout",), ("--checkout", str(self.checkout), "--unknown")):
            with self.subTest(args=args):
                result = self.run_helper(*args)
                self.assertEqual(result.returncode, 2)
                self.assertIn("usage:", result.stderr)
                self.assertNotIn("Traceback", result.stderr)
        self.assertFalse(self.marker.exists())


if __name__ == "__main__":
    unittest.main()
