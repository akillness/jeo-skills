#!/usr/bin/env python3
"""Hermetic tests for the zvec-grep read-only helper's version gate."""
from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills/zvec-grep/scripts/zvec-grep.sh"


class ZvecGrepHelperTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.log = self.root / "calls.log"
        self.log.write_text("", encoding="utf-8")

    def install_zg(self, version: str) -> None:
        script = ("#!/bin/sh\n"
                  f'echo "zg $*" >> "{self.log}"\n'
                  'if [ "$1" = version ]; then\n'
                  f'  echo "{version}"\n'
                  '  exit 0\n'
                  'fi\n'
                  'exit 0\n')
        path = self.bin / "zg"
        path.write_text(script, encoding="utf-8")
        path.chmod(0o755)

    def run_helper(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = {"PATH": f"{self.bin}:/usr/bin:/bin", "HOME": str(self.root)}
        return subprocess.run(["bash", str(HELPER), *args], env=env, capture_output=True, text=True, check=False)

    def calls(self) -> list[str]:
        return self.log.read_text(encoding="utf-8").splitlines()

    def test_doctor_reports_supported_cli_version(self):
        self.install_zg("0.2.2")
        proc = self.run_helper("doctor")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("0.2.2", proc.stdout)
        self.assertIn("supported", proc.stdout.lower())
        self.assertIn("zg version", self.calls())

    def test_read_only_commands_refuse_unsupported_cli_before_dispatch(self):
        for args in (("help",), ("status",), ("rg", "needle")):
            with self.subTest(command=args[0]):
                self.install_zg("0.3.0")
                self.log.write_text("", encoding="utf-8")
                proc = self.run_helper(*args)
                self.assertNotEqual(proc.returncode, 0, proc.stdout)
                self.assertIn("0.3.0", proc.stderr + proc.stdout)
                self.assertEqual(self.calls(), ["zg version"], self.calls())


if __name__ == "__main__":
    unittest.main()
