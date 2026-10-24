#!/usr/bin/env python3
"""Black-box regressions for the awesome gamedev guide and its offline helper."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / ".agent-skills/awesome-gamedev-agent-skills"
HELPER = PACKAGE / "scripts/preflight.py"
BASELINE = ROOT / ".agent-skills/agent-beacon/scripts/preflight.py"
EXPECTED_REPOSITORY = "gamedev-skills/awesome-gamedev-agent-skills"
EXPECTED_COMMIT = "7eb1b53305fab881f4758e2eff2e371cd7869221"


def resolved_temp_root(path: str | os.PathLike[str]) -> Path:
    """Resolve only test-owned temporary roots, including macOS /var aliases."""
    return Path(path).resolve()


class AwesomeGamedevAgentSkillsTests(unittest.TestCase):
    maxDiff = None

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="gamedev-preflight-")
        self.addCleanup(self.temp.cleanup)
        self.work = resolved_temp_root(self.temp.name)
        self.home = self.work / "home"
        self.bin = self.work / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.invocations = self.work / "upstream-invocations.jsonl"
        self.secret = "fixture-secret-must-not-appear"
        self.base_env = {
            "PATH": str(self.bin),
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "PYTHONDONTWRITEBYTECODE": "1",
            "PREFLIGHT_INVOCATIONS": str(self.invocations),
            "PREFLIGHT_SECRET": self.secret,
        }

    def env(self, **extra: str) -> dict[str, str]:
        value = dict(self.base_env)
        value.update(extra)
        return value

    def trap_tools(self, names: list[str]) -> None:
        script = (
            "#!" + sys.executable + "\n"
            "import json, os, sys\n"
            "with open(os.environ['PREFLIGHT_INVOCATIONS'], 'a', encoding='utf-8') as f:\n"
            "    f.write(json.dumps([os.path.basename(sys.argv[0]), *sys.argv[1:]]) + '\\n')\n"
            "raise SystemExit(97)\n"
        )
        for name in names:
            path = self.bin / name
            path.write_text(script, encoding="utf-8")
            path.chmod(0o700)

    def invoke(self, helper: Path, *args: str, env: dict[str, str] | None = None,
               cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-B", str(helper), *args], cwd=cwd or self.work,
            env=env or self.env(), text=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=10, check=False,
        )

    def report(self, result: subprocess.CompletedProcess[str]) -> dict:
        try:
            report = json.loads(result.stdout)
        except (TypeError, ValueError) as exc:
            self.fail(f"expected one JSON report, got {result.stdout!r}; stderr={result.stderr!r}: {exc}")
        self.assertIsInstance(report, dict)
        self.assertFalse(report.get("runtime_verified"))
        return report

    @staticmethod
    def snapshot(root: Path) -> tuple:
        rows = []
        for path in sorted(root.rglob("*")):
            relative = str(path.relative_to(root))
            if path.is_symlink():
                rows.append((relative, "symlink", os.readlink(path)))
            elif path.is_file():
                rows.append((relative, "file", path.read_bytes(), stat.S_IMODE(path.stat().st_mode)))
            elif path.is_dir():
                rows.append((relative, "directory"))
        return tuple(rows)

    def write_manifest(self, package: Path, files: dict[str, bytes], *, skill: str | None = None,
                       repository: str = "fixture/source", commit: str = "a" * 40,
                       tools: tuple[str, ...] = ("python3", "upstream-tool")) -> dict:
        rows = []
        for path, payload in files.items():
            rows.append({
                "path": path,
                "sha256": hashlib.sha256(payload).hexdigest(),
                "url": f"https://github.com/{repository}/blob/{commit}/{quote(path, safe='/')}",
                "purpose": "synthetic selected public file",
            })
        manifest = {
            "schema_version": 1,
            "skill": skill or package.name,
            "repository": repository,
            "commit": commit,
            "observed_at": "2026-10-24T00:00:00Z",
            "tools": [{"name": name, "purpose": "discovery only"} for name in tools],
            "files": rows,
        }
        manifest_path = package / "references/source.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return manifest

    def synthetic_package(self, name: str = "fixture-gamedev") -> tuple[Path, Path, Path, dict]:
        package = self.work / name
        (package / "scripts").mkdir(parents=True)
        shutil.copyfile(BASELINE, package / "scripts/preflight.py")
        (package / "scripts/preflight.py").chmod(0o755)
        source = self.work / (name + "-source")
        source.mkdir()
        files = {
            "README.md": b"selected README\n",
            "docs/guide.md": b"selected guide\n",
            "support/data.bin": bytes(range(32)),
            "nested/notes.txt": b"selected support bytes\n",
        }
        for path, payload in files.items():
            target = source / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
        manifest = self.write_manifest(package, files)
        return package, package / "scripts/preflight.py", source, manifest

    def test_default_helper_json_is_honest_offline_inventory(self):
        """Default invocation reports inventory only and never claims readiness."""
        manifest = json.loads((PACKAGE / "references/source.json").read_text(encoding="utf-8"))
        self.trap_tools([tool["name"] for tool in manifest.get("tools", [])])
        before = self.snapshot(self.work)
        result = self.invoke(HELPER, "--json")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = self.report(result)
        self.assertEqual(report["skill"], "awesome-gamedev-agent-skills")
        self.assertEqual(report["scope"], "offline-selected-files")
        self.assertEqual(report["status"], "ok")
        self.assertFalse(report["source_checked"])
        self.assertFalse(report.get("whole_revision_verified"))
        self.assertFalse(report.get("tool_versions_verified"))
        self.assertTrue(any("No source" in warning for warning in report["warnings"]))
        self.assertNotIn(self.secret, result.stdout + result.stderr)
        self.assertFalse(self.invocations.exists(), "offline inventory must not execute discovered tools")
        self.assertEqual(self.snapshot(self.work), before)

    def test_helper_matches_hardened_baseline_and_manifest_provenance(self):
        self.assertEqual(HELPER.read_bytes(), BASELINE.read_bytes())
        self.assertEqual(stat.S_IMODE(HELPER.stat().st_mode), 0o755)
        manifest = json.loads((PACKAGE / "references/source.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["repository"], EXPECTED_REPOSITORY)
        self.assertEqual(manifest["commit"], EXPECTED_COMMIT)
        self.assertGreaterEqual(len(manifest["files"]), 1)
        self.assertLessEqual(len(manifest["files"]), 12)
        paths = [item["path"] for item in manifest["files"]]
        self.assertEqual(len(paths), len(set(paths)))
        for item in manifest["files"]:
            self.assertEqual(
                item["url"],
                f"https://github.com/{EXPECTED_REPOSITORY}/blob/{EXPECTED_COMMIT}/{quote(item['path'], safe='/')}",
            )

    def test_catalog_classifies_guide_as_game_client_not_knowledge_repository(self):
        catalog = json.loads((ROOT / ".agent-skills/skills.json").read_text(encoding="utf-8"))
        row = next(item for item in catalog["skills"] if item["name"] == "awesome-gamedev-agent-skills")
        self.assertEqual(row["category"], "game")
        self.assertEqual(row["subcategory"], "client")

    def test_copied_helper_checks_every_selected_file_and_rejects_tampering(self):
        package, helper, source, manifest = self.synthetic_package()
        self.assertEqual(stat.S_IMODE(helper.stat().st_mode), 0o755)
        before_matching = self.snapshot(self.work)
        matching = self.invoke(helper, "--json", "--repo", str(source))
        self.assertEqual(matching.returncode, 0, matching.stdout + matching.stderr)
        matching_report = self.report(matching)
        file_checks = [check for check in matching_report["checks"] if check["name"].startswith("file:")]
        self.assertEqual([check["name"] for check in file_checks], ["file:" + item["path"] for item in manifest["files"]])
        self.assertEqual([check["status"] for check in file_checks], ["match"] * len(manifest["files"]))
        self.assertTrue(matching_report["source_checked"])
        self.assertEqual(self.snapshot(self.work), before_matching)

        tampered = source / manifest["files"][1]["path"]
        original = tampered.read_bytes()
        before = self.snapshot(source)
        tampered.write_bytes(b"tampered selected file\n")
        before_mismatch = self.snapshot(self.work)
        mismatch = self.invoke(helper, "--json", "--repo", str(source))
        self.assertEqual(mismatch.returncode, 1, mismatch.stdout + mismatch.stderr)
        mismatch_report = self.report(mismatch)
        mismatch_checks = [check for check in mismatch_report["checks"] if check["name"].startswith("file:")]
        expected_mismatch_statuses = ["match"] * len(manifest["files"])
        expected_mismatch_statuses[1] = "mismatch"
        self.assertEqual([check["status"] for check in mismatch_checks], expected_mismatch_statuses)
        self.assertEqual(sum(check["status"] == "mismatch" for check in mismatch_checks), 1)
        self.assertEqual(mismatch_report["status"], "blocked")
        self.assertEqual(self.snapshot(self.work), before_mismatch)
        tampered.write_bytes(original)
        self.assertEqual(self.snapshot(source), before)

    def test_helper_rejects_invalid_secret_and_symlink_inputs_without_writes(self):
        _package, helper, source, _manifest = self.synthetic_package("fixture-invalid")
        before_invalid = self.snapshot(self.work)
        for bad_repo in ("relative-source", str(source / ".." / "..")):
            with self.subTest(repo=bad_repo):
                result = self.invoke(helper, "--json", "--repo", bad_repo)
                report = self.report(result)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(report["status"], "error")
                self.assertEqual(self.snapshot(self.work), before_invalid)
        alias = self.work / "source-alias"
        alias.symlink_to(source, target_is_directory=True)
        before_symlink = self.snapshot(self.work)
        symlink_result = self.invoke(helper, "--json", "--repo", str(alias))
        symlink_report = self.report(symlink_result)
        self.assertEqual(symlink_result.returncode, 2)
        self.assertEqual(symlink_report["status"], "error")
        self.assertEqual(self.snapshot(self.work), before_symlink)

        unsafe = self.work / "fixture-unsafe"
        (unsafe / "scripts").mkdir(parents=True)
        shutil.copyfile(BASELINE, unsafe / "scripts/preflight.py")
        (unsafe / "scripts/preflight.py").chmod(0o755)
        self.write_manifest(unsafe, {"private/token.txt": self.secret.encode()})
        before_unsafe = self.snapshot(self.work)
        unsafe_result = self.invoke(unsafe / "scripts/preflight.py", "--json")
        unsafe_report = self.report(unsafe_result)
        self.assertEqual(unsafe_result.returncode, 2)
        self.assertEqual(unsafe_report["status"], "error")
        self.assertNotIn(self.secret, unsafe_result.stdout + unsafe_result.stderr)
        self.assertEqual(self.snapshot(self.work), before_unsafe)

    def test_helper_has_no_git_revision_flag_and_keeps_json_error_shape(self):
        _package, helper, _source, _manifest = self.synthetic_package("fixture-args")
        result = self.invoke(helper, "--json", "--expect-commit", "a" * 40)
        report = self.report(result)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(report["status"], "error")
        self.assertEqual(report["checks"], [{"name": "input", "status": "blocked", "code": "invalid_arguments"}])


if __name__ == "__main__":
    unittest.main()

