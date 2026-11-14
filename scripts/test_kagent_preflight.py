#!/usr/bin/env python3
"""Black-box regressions for kagent's offline preflight helper."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills" / "kagent" / "scripts" / "preflight.py"


class KagentPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="kagent-preflight-")
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
        (self.home / ".kube").mkdir()
        (self.home / ".kube" / "config").write_text("SECRET_KUBECONFIG_TOKEN", encoding="utf-8")

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
            timeout=10,
            check=False,
        )

    def test_missing_executables_reported_without_network_or_binary_execution(self):
        result = self.invoke("--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertIsNone(report["kagent"])
        self.assertFalse(report["network_used"])
        self.assertFalse(report["binaries_executed"])
        self.assertFalse(report["credentials_read"])
        self.assertFalse(self.marker.exists(), "preflight executed a forbidden operation")

    def test_mock_binaries_discovered_by_path(self):
        for name in ("kagent", "kubectl", "helm", "docker"):
            p = self.bin / name
            p.write_text("#!/bin/sh\nexit 0\n")
            p.chmod(0o755)

        result = self.invoke("--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["kagent"], str(self.bin / "kagent"))
        self.assertEqual(report["kubectl"], str(self.bin / "kubectl"))
        self.assertEqual(report["helm"], str(self.bin / "helm"))
        self.assertEqual(report["docker"], str(self.bin / "docker"))
        self.assertFalse(report["binaries_executed"])
        self.assertFalse(self.marker.exists())

    def test_repo_validation_matches_valid_repo(self):
        repo_dir = self.work / "kagent-repo"
        repo_dir.mkdir()
        for f in ("README.md", "LICENSE", "Makefile", "AGENTS.md"):
            (repo_dir / f).write_text("test fixture\n")

        result = self.invoke("--json", "--repo", str(repo_dir))
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report["repo_verified"])
        self.assertEqual(report["missing_repo_files"], [])

    def test_repo_validation_detects_missing_files(self):
        repo_dir = self.work / "partial-repo"
        repo_dir.mkdir()
        (repo_dir / "README.md").write_text("partial\n")

        result = self.invoke("--json", "--repo", str(repo_dir))
        self.assertEqual(result.returncode, 1, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report["repo_verified"])
        self.assertIn("LICENSE", report["missing_repo_files"])
        self.assertIn("Makefile", report["missing_repo_files"])

    def test_repo_validation_rejects_sensitive_paths(self):
        sensitive_dir = self.work / ".ssh"
        sensitive_dir.mkdir()

        result = self.invoke("--json", "--repo", str(sensitive_dir))
        self.assertEqual(result.returncode, 2, result.stderr)

    def test_repo_validation_rejects_relative_paths(self):
        result = self.invoke("--json", "--repo", "relative/path")
        self.assertEqual(result.returncode, 2, result.stderr)


if __name__ == "__main__":
    unittest.main()
