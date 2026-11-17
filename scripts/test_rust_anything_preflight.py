#!/usr/bin/env python3
"""Black-box regressions for rust-anything offline preflight, workspace inspection, and manifest detection helper."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills" / "rust-anything" / "scripts" / "preflight.py"


class RustAnythingPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="rust-anything-preflight-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.home = self.work / "home"
        self.home.mkdir()
        self.marker = self.work / "executed"

        # Audit hook to enforce strict offline and no-credential-read contracts in the child
        (self.work / "sitecustomize.py").write_text(
            "import os, sys\n"
            "home = os.environ['HOME'] + os.sep\n"
            "def reject(reason):\n"
            "    with open(os.environ['PREFLIGHT_MARKER'], 'a') as stream:\n"
            "        stream.write(reason + '\\n')\n"
            "    raise RuntimeError(reason)\n"
            "def guard(event, args):\n"
            "    if event.startswith('socket.') or event in ('subprocess.Popen', 'os.system', 'os.exec', 'os.spawn'):\n"
            "        reject('forbidden operation: ' + event)\n"
            "    if event == 'open' and isinstance(args[0], (str, bytes, os.PathLike)):\n"
            "        target = os.fsdecode(args[0])\n"
            "        if 'SECRET' in target:\n"
            "            reject('forbidden secret read')\n"
            "sys.addaudithook(guard)\n",
            encoding="utf-8",
        )

    def invoke(self, *args, path=None, cwd=None):
        env = {
            "PATH": str(self.bin) if path is None else path,
            "HOME": str(self.home),
            "PYTHONPATH": str(self.work),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PREFLIGHT_MARKER": str(self.marker),
        }
        return subprocess.run(
            [sys.executable, str(HELPER), *args],
            cwd=cwd or self.work,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def test_help_flag_zero_exit(self):
        result = self.invoke("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Offline inventory, source-manifest detection", result.stdout)
        self.assertFalse(self.marker.exists())

    def test_json_output_mode(self):
        result = self.invoke("--json")
        self.assertIn(result.returncode, (0, 1))
        payload = json.loads(result.stdout)
        self.assertIn("status", payload)
        self.assertIn("cli", payload)
        self.assertFalse(self.marker.exists())

    def test_discovers_binary_in_path(self):
        fake_bin = self.bin / "rust-anything"
        fake_bin.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake_bin.chmod(0o755)

        result = self.invoke("--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["cli"]["rust_anything"], str(fake_bin))

    def test_detects_workspace_manifests_and_fixtures(self):
        app_dir = self.work / "python_project"
        app_dir.mkdir()
        (app_dir / "pyproject.toml").write_text("[project]\nname='test-app'\n", encoding="utf-8")
        (app_dir / "Cargo.toml").write_text("[package]\nname='rust-engine'\n", encoding="utf-8")

        fixtures_dir = app_dir / "golden_fixtures"
        fixtures_dir.mkdir()
        (fixtures_dir / "case_01.json").write_text("{}", encoding="utf-8")
        (fixtures_dir / "case_02.json").write_text("{}", encoding="utf-8")

        (app_dir / "rust-anything.toml").write_text(
            "[source]\nlanguage = 'python'\n[target]\nprofile = 'library'\n",
            encoding="utf-8"
        )

        result = self.invoke("--workspace", str(app_dir), "--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertIsNotNone(payload["workspace_analysis"])
        ws = payload["workspace_analysis"]
        self.assertTrue(ws["has_rust_target"])
        self.assertIn("Python", ws["detected_languages"])
        self.assertEqual(ws["fixtures"]["recorded_json_fixtures_count"], 2)
        self.assertTrue(ws["configuration"]["has_source_section"])

    def test_rejects_relative_or_sensitive_path(self):
        result_rel = self.invoke("--workspace", "relative/project")
        self.assertEqual(result_rel.returncode, 2)
        self.assertIn("path must be absolute", result_rel.stderr)

        bad_dir = self.work / ".git"
        bad_dir.mkdir()
        result_sens = self.invoke("--workspace", str(bad_dir))
        self.assertEqual(result_sens.returncode, 2)
        self.assertIn("sensitive path component", result_sens.stderr)


if __name__ == "__main__":
    unittest.main()
