#!/usr/bin/env python3
"""Black-box offline contracts for the SkillEvaluator selected-file preflight.

Run: python3 -B scripts/test_nvidia_skill_evaluator.py -v
Only synthetic public bytes and a copied helper are executed; no upstream code,
provider, installation, or network access is required.
"""
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
HELPER = ROOT / ".agent-skills/nvidia-skill-evaluator/scripts/preflight.py"
PUBLIC_FILES = {"README.md": b"public fixture\n", "src/check.py": b"public source bytes\n"}
SECRET = "fixture-credential-never-disclose"
TOOLS = ("python3", "uv", "git", "skill-evaluator")


class NvidiaSkillEvaluatorPreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="nvidia-skill-preflight-")
        self.addCleanup(self.temp.cleanup)
        # Canonicalize only our owned fixture base: /tmp and /var are aliases on
        # macOS. Caller-provided --repo paths remain literal to test rejection.
        self.work = Path(self.temp.name).resolve()
        self.package = self.work / "nvidia-skill-evaluator"
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
            "skill": self.package.name,
            "repository": "NVIDIA/SkillEvaluator",
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
        for name in (*TOOLS, "python", "pip", "pip3", "curl", "wget", "bash", "docker"):
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
            "url": "https://github.com/NVIDIA/SkillEvaluator/blob/" + "a" * 40 + "/" + quote(name, safe="/"),
        }

    def write_manifest(self, manifest: dict) -> None:
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

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
        # These are safety claims, not configurable defaults: no invocation of
        # this offline helper can establish runtime, versions, or whole HEAD.
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

    def test_published_package_inventory_accepts_its_actual_source_manifest(self):
        # Execute the shipped package, not a synthetic manifest: a valid
        # helper can still ship with incompatible pin URL metadata.
        self.helper = HELPER.resolve()
        exit_code, report = self.invoke(with_tools=False)
        self.assertEqual(exit_code, 0, report)
        self.assertEqual(report["repository"], "NVIDIA/SkillEvaluator")
        self.assertEqual(report["expected_commit"], "12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2")
        self.assertIs(report["source_checked"], False)

    def test_inventory_discovers_trap_tools_without_executing_them(self):
        before = self.manifest_path.read_bytes()
        exit_code, report = self.invoke()
        self.assertEqual(exit_code, 0)
        self.assertIs(report["source_checked"], False)
        self.assertEqual(report["checks"], [{"name": "tool:" + name, "status": "present"} for name in TOOLS])
        self.assertEqual(self.manifest_path.read_bytes(), before)

    def test_missing_tools_are_informational_even_when_source_matches(self):
        exit_code, report = self.invoke("--repo", str(self.source), with_tools=False)
        self.assertEqual(exit_code, 0)
        self.assertIs(report["source_checked"], True)
        self.assertEqual([c for c in report["checks"] if c["name"].startswith("tool:")],
                         [{"name": "tool:" + name, "status": "missing"} for name in TOOLS])
        self.assertEqual([c for c in report["checks"] if c["name"].startswith("file:")],
                         [{"name": "file:" + name, "status": "match"} for name in PUBLIC_FILES])

    def test_selected_matches_ignore_unrelated_head_and_unlisted_private_files(self):
        (self.source / ".git").mkdir()
        (self.source / ".git/HEAD").write_text("not the pinned revision\n", encoding="utf-8")
        (self.source / ".env").write_text(SECRET, encoding="utf-8")
        os.mkfifo(self.source / "unlisted-fifo")
        exit_code, report = self.invoke("--repo", str(self.source))
        self.assertEqual(exit_code, 0)
        self.assertIs(report["source_checked"], True)
        self.assertEqual([c for c in report["checks"] if c["name"].startswith("file:")],
                         [{"name": "file:" + name, "status": "match"} for name in PUBLIC_FILES])

    def test_one_changed_file_blocks_without_hiding_other_selected_results(self):
        (self.source / "README.md").write_bytes(b"changed public bytes\n")
        exit_code, report = self.invoke("--repo", str(self.source))
        self.assertEqual(exit_code, 1)
        self.assertEqual([c for c in report["checks"] if c["name"].startswith("file:")], [
            {"name": "file:README.md", "status": "mismatch"},
            {"name": "file:src/check.py", "status": "match"},
        ])

    def test_missing_root_or_selected_file_returns_blocked_not_success(self):
        report = self.assert_error(("--repo", str(self.work / "missing")), "source_root_missing", 1)
        self.assertIs(report["source_checked"], False)
        (self.source / "README.md").unlink()
        report = self.assert_error(("--repo", str(self.source)), "public_file_missing", 1)
        self.assertIn({"name": "file:src/check.py", "status": "match"}, report["checks"])

    def test_bad_arguments_and_nonabsolute_roots_are_sanitized_json_errors(self):
        for args, code in (
            (("--unknown", SECRET), "invalid_arguments"),
            (("--repo",), "invalid_arguments"),
            (("--rep", str(self.source)), "invalid_arguments"),
            (("--repo", "source"), "absolute_nonsymlink_root_required"),
            (("--repo", str(self.source / ".." / "source")), "absolute_nonsymlink_root_required"),
            (("--repo", str(self.work / ("missing-" + SECRET))), "source_root_missing"),
        ):
            with self.subTest(args=args):
                self.assert_error(args, code, 1 if code == "source_root_missing" else 2)

    def test_symlink_root_and_symlink_root_ancestor_are_rejected(self):
        alias = self.work / "root-alias"
        alias.symlink_to(self.source, target_is_directory=True)
        ancestor = self.work / "ancestor-alias"
        ancestor.symlink_to(self.work, target_is_directory=True)
        for root in (alias, ancestor / "source"):
            with self.subTest(root=root.name):
                self.assert_error(("--repo", str(root)), "source_root_unsafe_or_unreadable")

    def test_symlink_selected_file_and_selected_directory_are_rejected(self):
        readme = self.source / "README.md"
        readme.unlink()
        readme.symlink_to(self.home / ".netrc")
        self.assert_error(("--repo", str(self.source)), "public_file_unsafe_or_unreadable")
        readme.unlink()
        readme.write_bytes(PUBLIC_FILES["README.md"])
        (self.source / "src").rename(self.source / "real-src")
        (self.source / "src").symlink_to(self.source / "real-src", target_is_directory=True)
        self.assert_error(("--repo", str(self.source)), "public_file_unsafe_or_unreadable")

    def test_selected_fifo_directory_and_oversized_file_fail_closed(self):
        selected = self.source / "README.md"
        selected.unlink()
        os.mkfifo(selected)
        self.assert_error(("--repo", str(self.source)), "public_file_not_regular_or_too_large")
        selected.unlink()
        selected.mkdir()
        self.assert_error(("--repo", str(self.source)), "public_file_not_regular_or_too_large")
        selected.rmdir()
        with selected.open("wb") as stream:
            stream.truncate(8 * 1024 * 1024 + 1)
        self.assert_error(("--repo", str(self.source)), "public_file_not_regular_or_too_large")

    def test_manifest_symlink_and_symlink_parent_are_rejected(self):
        raw = self.manifest_path.read_bytes()
        self.manifest_path.unlink()
        self.manifest_path.symlink_to(self.home / ".netrc")
        self.assert_error((), "public_file_unsafe_or_unreadable")
        self.manifest_path.unlink()
        self.manifest_path.write_bytes(raw)
        refs = self.package / "references"
        refs.rename(self.package / "real-references")
        refs.symlink_to(self.package / "real-references", target_is_directory=True)
        self.assert_error((), "public_file_unsafe_or_unreadable")

    def test_manifest_fifo_directory_and_size_limit_fail_closed(self):
        self.manifest_path.unlink()
        os.mkfifo(self.manifest_path)
        self.assert_error((), "public_file_not_regular_or_too_large")
        self.manifest_path.unlink()
        self.manifest_path.mkdir()
        self.assert_error((), "public_file_not_regular_or_too_large")
        self.manifest_path.rmdir()
        with self.manifest_path.open("wb") as stream:
            stream.truncate(128 * 1024 + 1)
        self.assert_error((), "public_file_not_regular_or_too_large")

    def test_invalid_manifest_fields_and_duplicate_entries_are_rejected(self):
        cases = (
            ("schema_version", True, "invalid_source_manifest"),
            ("skill", "wrong-skill", "manifest_skill_mismatch"),
            ("repository", "https://user:" + SECRET + "@example.invalid/repo", "invalid_repository"),
            ("commit", "main", "invalid_source_pin"),
            ("files", [], "invalid_manifest_inventory"),
            ("files", [self.entry(f"public-{n}.txt", b"x") for n in range(13)], "invalid_manifest_inventory"),
            ("files", [self.manifest["files"][0]] * 2, "duplicate_source_path"),
            ("files", [{**self.manifest["files"][0], "sha256": "not-a-hash"}], "invalid_source_hash"),
            ("files", [{**self.manifest["files"][0], "url": "https://github.com/NVIDIA/SkillEvaluator/blob/main/README.md"}], "source_url_pin_mismatch"),
            ("tools", [{"name": "uv; " + SECRET, "purpose": "must not execute"}], "invalid_tool_name"),
        )
        for field, value, code in cases:
            with self.subTest(field=field, code=code, value=value):
                manifest = copy.deepcopy(self.manifest)
                manifest[field] = value
                self.write_manifest(manifest)
                self.assert_error((), code)

    def test_traversal_noncanonical_and_secret_manifest_paths_are_rejected_before_read(self):
        for name, code in (
            ("../outside", "invalid_public_path"), ("/etc/passwd", "invalid_public_path"),
            ("src//check.py", "invalid_public_path"), ("src\\check.py", "invalid_public_path"),
            ("src/./check.py", "invalid_public_path"), ("src/\nprivate", "invalid_public_path"),
            (".env", "sensitive_path_not_allowed"), (".git/config", "sensitive_path_not_allowed"),
            (".ssh/id_rsa", "sensitive_path_not_allowed"), (".aws/config", "sensitive_path_not_allowed"),
            ("credentials.json", "sensitive_path_not_allowed"), ("src/token.json", "sensitive_path_not_allowed"),
            ("client.pem", "sensitive_path_not_allowed"),
        ):
            with self.subTest(path=name):
                manifest = copy.deepcopy(self.manifest)
                manifest["files"] = [self.entry(name, b"unreadable public fixture")]
                self.write_manifest(manifest)
                self.assert_error(("--repo", str(self.source)), code)

    def test_malformed_duplicate_key_and_non_utf8_manifests_are_json_errors(self):
        for raw, code in (
            (b'{"private": "' + SECRET.encode() + b'"', "invalid_source_manifest"),
            (b'{"schema_version": 1, "schema_version": 1}', "duplicate_manifest_key"),
            (b'\xff\xfe\x00', "invalid_source_manifest"),
            (b'[]', "invalid_source_manifest"),
        ):
            with self.subTest(code=code, raw=raw):
                self.manifest_path.write_bytes(raw)
                self.assert_error((), code)


if __name__ == "__main__":
    unittest.main()
