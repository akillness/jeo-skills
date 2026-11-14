#!/usr/bin/env python3
"""Black-box regressions for TruLens offline preflight helper."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills" / "trulens" / "scripts" / "preflight.py"


class TruLensPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="trulens-preflight-")
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
        self.assertIn("Offline inventory and environment check for TruLens", result.stdout)
        self.assertFalse(self.marker.exists())

    def test_json_output_mode(self):
        result = self.invoke("--json")
        self.assertIn(result.returncode, (0, 1))
        payload = json.loads(result.stdout)
        self.assertIn("status", payload)
        self.assertIn("cli", payload)
        self.assertIn("python_packages", payload)
        self.assertIn("local_databases", payload)
        self.assertFalse(self.marker.exists())

    def test_discovers_binary_in_path(self):
        fake_trulens = self.bin / "trulens"
        fake_trulens.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake_trulens.chmod(0o755)

        result = self.invoke("--json")
        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["cli"]["trulens"], str(fake_trulens))

    def test_rejects_relative_repo_path(self):
        result = self.invoke("--repo-dir", "relative/path")
        self.assertEqual(result.returncode, 2)
        self.assertIn("repo path must be absolute", result.stderr)

    def test_rejects_sensitive_repo_path(self):
        bad_dir = self.work / ".ssh"
        bad_dir.mkdir()
        result = self.invoke("--repo-dir", str(bad_dir))
        self.assertEqual(result.returncode, 2)
        self.assertIn("sensitive path component not allowed", result.stderr)

    def test_detects_local_sqlite_database(self):
        db_file = self.work / "default.sqlite"
        db_file.write_text("", encoding="utf-8")
        result = self.invoke("--json")
        payload = json.loads(result.stdout)
        self.assertIn("default.sqlite", payload["local_databases"])


if __name__ == "__main__":
    unittest.main()
