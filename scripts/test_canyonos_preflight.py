#!/usr/bin/env python3
"""Black-box offline contracts for the CanyonOS selected-file preflight."""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills/canyonos/scripts/preflight.py"
PACKAGE = "canyonos"
REPOSITORY = "CanyonCodeCoreAI/canyonos"
TOOLS = ("python3", "uv", "docker", "canyonos", "git")
PUBLIC_FILES = {"README.md": b"canyonos fixture\n", "docs/check.py": b"public source bytes\n"}
SECRET = "fixture-credential-never-disclose"


class CanyonOSPreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="canyonos-skill-preflight-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name).resolve()
        self.package = self.work / PACKAGE
        (self.package / "scripts").mkdir(parents=True)
        (self.package / "references").mkdir()
        self.helper = self.package / "scripts/preflight.py"
        shutil.copyfile(HELPER, self.helper)
        self.manifest_path = self.package / "references/source.json"
        self.source = self.work / "source"
        for name, payload in PUBLIC_FILES.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
        self.manifest = {
            "schema_version": 1,
            "skill": PACKAGE,
            "repository": REPOSITORY,
            "commit": "a" * 40,
            "tools": [{"name": name, "purpose": "inventory only"} for name in TOOLS],
            "files": [self.entry(name, payload) for name, payload in PUBLIC_FILES.items()],
        }
        self.write_manifest(self.manifest)
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.home = self.work / "private-home"
        self.home.mkdir()
        (self.home / ".netrc").write_text(SECRET, encoding="utf-8")
        self.sentinel = self.work / "upstream-invoked"
        trap = (
            "#!" + sys.executable + "\n"
            "import os\n"
            "with open(os.environ['PREFLIGHT_SENTINEL'], 'a') as f: f.write('ran\\n')\n"
            "raise SystemExit(93)\n"
        )
        for name in (*TOOLS, "python", "pip", "pip3", "curl", "wget", "bash"):
            executable = self.bin / name
            executable.write_text(trap, encoding="utf-8")
            executable.chmod(0o700)
        self.env = {
            "PATH": str(self.bin), "HOME": str(self.home),
            "TMPDIR": str(self.work), "PYTHONDONTWRITEBYTECODE": "1",
            "PREFLIGHT_SENTINEL": str(self.sentinel),
            "OPENAI_API_KEY": SECRET, "ANTHROPIC_API_KEY": SECRET,
            "GIT_DIR": str(self.home / "not-a-git-dir"),
        }

    def entry(self, name: str, payload: bytes) -> dict:
        return {
            "path": name, "sha256": hashlib.sha256(payload).hexdigest(),
            "url": f"https://github.com/{REPOSITORY}/blob/" + "a" * 40 + "/" + quote(name, safe="/"),
        }

    def write_manifest(self, payload: dict) -> None:
        self.manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def invoke(self, *args: str, with_tools: bool = True) -> tuple[int, dict]:
        env = dict(self.env)
        env["PATH"] = str(self.bin) if with_tools else ""
        result = subprocess.run(
            [sys.executable, "-B", str(self.helper), "--json", *args],
            cwd=self.work, env=env, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=8, check=False,
        )
        self.assertEqual(result.stderr, "", result.stderr)
        self.assertNotIn(str(self.work), result.stdout)
        self.assertNotIn(SECRET, result.stdout)
        self.assertFalse(self.sentinel.exists(), "offline inventory executed an upstream tool")
        try:
            report = json.loads(result.stdout)
        except ValueError:
            self.fail(f"expected one JSON report, got {result.stdout!r}")
        self.assertEqual(report["scope"], "offline-selected-files")
        for field in ("runtime_verified", "whole_revision_verified", "tool_versions_verified"):
            self.assertIs(report[field], False)
        self.assertIsInstance(report["warnings"], list)
        self.assertEqual(report["status"], {0: "ok", 1: "blocked", 2: "error"}[result.returncode])
        return result.returncode, report

    def assert_error(self, args: tuple[str, ...], code: str, exit_code: int = 2) -> dict:
        actual, report = self.invoke(*args)
        self.assertEqual(actual, exit_code, report)
        self.assertIn(code, [check.get("code") for check in report["checks"]], report)
        return report

    def test_help_flag_zero_exit(self) -> None:
        result = subprocess.run(
            [sys.executable, "-B", str(self.helper), "--help"],
            cwd=self.work, env=self.env, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("usage:", result.stdout.lower())
        self.assertFalse(self.sentinel.exists())

    def test_inventory_without_repo(self) -> None:
        exit_code, report = self.invoke()
        self.assertEqual(exit_code, 0)
        self.assertEqual(report["skill"], PACKAGE)
        self.assertEqual(report["repository"], REPOSITORY)
        self.assertIs(report["source_checked"], False)
        self.assertEqual(report["checks"], [{"name": "tool:" + name, "status": "present"} for name in TOOLS])

    def test_missing_tools_are_informational(self) -> None:
        exit_code, report = self.invoke(with_tools=False)
        self.assertEqual(exit_code, 0)
        self.assertIs(report["source_checked"], False)
        self.assertEqual(report["checks"], [{"name": "tool:" + name, "status": "missing"} for name in TOOLS])

    def test_matched_source_repo(self) -> None:
        exit_code, report = self.invoke("--repo", str(self.source))
        self.assertEqual(exit_code, 0)
        self.assertIs(report["source_checked"], True)
        checks = {c["name"]: c["status"] for c in report["checks"] if c["name"].startswith("file:")}
        self.assertEqual(checks["file:README.md"], "match")
        self.assertEqual(checks["file:docs/check.py"], "match")

    def test_one_changed_file_blocks_without_hiding_other_selected_results(self) -> None:
        (self.source / "README.md").write_bytes(b"tampered content\n")
        exit_code, report = self.invoke("--repo", str(self.source))
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["status"], "blocked")
        checks = {c["name"]: c["status"] for c in report["checks"] if c["name"].startswith("file:")}
        self.assertEqual(checks["file:README.md"], "mismatch")
        self.assertEqual(checks["file:docs/check.py"], "match")

    def test_missing_source_file_blocks(self) -> None:
        (self.source / "README.md").unlink()
        exit_code, report = self.invoke("--repo", str(self.source))
        self.assertEqual(exit_code, 1)
        self.assertEqual(report["status"], "blocked")
        checks = {c["name"]: c["status"] for c in report["checks"] if c["name"].startswith("file:")}
        self.assertEqual(checks["file:README.md"], "blocked")
        self.assertEqual(checks["file:docs/check.py"], "match")

    def test_rejects_relative_repo_path(self) -> None:
        self.assert_error(("--repo", "relative/path"), "absolute_nonsymlink_root_required", 2)

    def test_rejects_missing_repo_root(self) -> None:
        self.assert_error(("--repo", str(self.work / "nonexistent")), "source_root_missing", 1)

    def test_published_package_inventory_accepts_its_actual_source_manifest(self) -> None:
        self.helper = HELPER.resolve()
        exit_code, report = self.invoke(with_tools=False)
        self.assertEqual(exit_code, 0, report)
        self.assertEqual(report["skill"], PACKAGE)
        self.assertEqual(report["repository"], REPOSITORY)
        self.assertEqual(report["expected_commit"], "49e9bd042735aa88e694c9e1fc5069223ba19820")
        self.assertIs(report["source_checked"], False)


if __name__ == "__main__":
    unittest.main()
