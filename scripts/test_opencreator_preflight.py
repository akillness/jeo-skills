#!/usr/bin/env python3
"""Black-box subprocess regressions for OpenCreator's offline preflight."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / ".agent-skills" / "opencreator"
HELPER = PACKAGE / "scripts" / "preflight.py"
PINNED_COMMIT = "b01a9f71165b9010216e25c462653b0cfa33cbce"
SOURCE_FILES = (
    "README.md",
    "LICENSE",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "docs/contributing/skills-contributing.md",
    "apps/web/package.json",
    "apps/desktop/package.json",
    "apps/daemon/package.json",
    "packages/protocol/package.json",
    "packages/skill-market/package.json",
    "skills/krillinai-tts/SKILL.md",
)
SOURCE_DIRS = (
    "apps/web",
    "apps/desktop",
    "apps/daemon",
    "packages/protocol",
    "packages/skill-market",
    "skills",
)
TRAP_TOOLS = ("codex", "pnpm", "node", "npm", "npx", "curl", "wget")


class OpenCreatorPreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="opencreator-preflight-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()
        self.repo = self.work / "OpenCreator"
        self.repo.mkdir()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.home = self.work / "home"
        self.home.mkdir()
        self.secret_file = self.home / "auth.json"
        self.secret_file.write_text('{"token":"never-read-this-file"}\n', encoding="utf-8")
        self.invocations = self.work / "unexpected-tool-invocations.jsonl"
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is needed to build a local source fixture")
        (self.bin / "git").symlink_to(self.git)
        self._install_trap_tools()
        self._make_source_tree()
        self._init_git_repo()
        self.head = self.git_output("rev-parse", "HEAD")

    def _make_source_tree(self) -> None:
        for relative in SOURCE_DIRS:
            (self.repo / relative).mkdir(parents=True, exist_ok=True)
        for relative in SOURCE_FILES:
            path = self.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"fixture source marker: {relative}\n", encoding="utf-8")

    def _git_env(self) -> dict[str, str]:
        return {
            "PATH": os.environ.get("PATH", ""),
            "HOME": str(self.home),
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_TERMINAL_PROMPT": "0",
            "TMPDIR": str(self.work),
        }

    def _init_git_repo(self) -> None:
        self.git_call("init", "--quiet")
        self.git_call("config", "user.name", "OpenCreator Fixture")
        self.git_call("config", "user.email", "fixture@example.invalid")
        self.git_call("add", "-A")
        self.git_call("commit", "--quiet", "-m", "fixture")

    def git_call(self, *args: str) -> str:
        result = subprocess.run(
            [self.git, "-C", str(self.repo), *args],
            env=self._git_env(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.rstrip("\r\n")

    def git_output(self, *args: str) -> str:
        return self.git_call(*args)

    def _install_trap_tools(self) -> None:
        for name in TRAP_TOOLS:
            path = self.bin / name
            path.write_text(
                "#!" + sys.executable + "\n"
                "import json, os, sys\n"
                "with open(" + repr(str(self.invocations)) + ", 'a', encoding='utf-8') as stream:\n"
                "    stream.write(json.dumps([os.path.basename(sys.argv[0]), *sys.argv[1:]]) + '\\n')\n"
                "raise SystemExit(97)\n",
                encoding="utf-8",
            )
            path.chmod(0o700)

    def env(self, *, with_git: bool = True, **extra: str) -> dict[str, str]:
        value = {
            "PATH": str(self.bin) if with_git else "",
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "PYTHONDONTWRITEBYTECODE": "1",
            "OPENAI_API_KEY": "SECRET_DO_NOT_ECHO_OPENAI",
            "AUTH_GOOGLE_ID": "SECRET_DO_NOT_ECHO_GOOGLE",
            "GITHUB_TOKEN": "SECRET_DO_NOT_ECHO_GITHUB",
            "PREFLIGHT_TEST_LOG": str(self.invocations),
        }
        for key in ("PYTHONHOME", "PYTHONNOUSERSITE", "PYTHONPATH"):
            if key in os.environ:
                value[key] = os.environ[key]
        value.update(extra)
        return value

    def invoke(
        self,
        *args: str,
        helper: Path = HELPER,
        with_git: bool = True,
        extra_env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        env = self.env(with_git=with_git, **(extra_env or {}))
        return subprocess.run(
            [sys.executable, str(helper), *args],
            cwd=self.work,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
            check=False,
        )

    def report(self, result: subprocess.CompletedProcess[str]) -> dict:
        try:
            value = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            self.fail(f"expected one JSON report, got {result.stdout!r}; stderr={result.stderr!r}: {exc}")
        self.assertIsInstance(value, dict)
        self.assertEqual(value.get("skill"), "opencreator")
        self.assertEqual(value.get("scope"), "offline-preflight")
        self.assertIn(value.get("status"), {"ok", "blocked", "error"})
        self.assertIsInstance(value.get("checks"), list)
        self.assertIs(value.get("runtime_verified"), False)
        return value

    @staticmethod
    def digest_tree(root: Path) -> dict[str, str]:
        result: dict[str, str] = {}
        for path in sorted(root.rglob("*")):
            relative = str(path.relative_to(root))
            if path.is_symlink():
                result[relative] = "symlink:" + os.readlink(path)
            elif path.is_file():
                result[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
            elif path.is_dir():
                result[relative] = "directory"
        return result

    def test_help_works_without_git_and_lists_supported_arguments(self):
        result = self.invoke("--help", with_git=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--json", result.stdout)
        self.assertIn("--repo", result.stdout)
        self.assertIn("--expect-commit", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_default_json_is_offline_and_never_claims_runtime_readiness(self):
        before_repo = self.digest_tree(self.repo)
        before_home = self.digest_tree(self.home)
        result = self.invoke("--json", with_git=False)
        report = self.report(result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report["status"], "ok")
        self.assertIn("runtime", {item["name"] for item in report["checks"]})
        self.assertNotIn("SECRET_DO_NOT_ECHO", result.stdout + result.stderr)
        self.assertNotIn("never-read-this-file", result.stdout + result.stderr)
        self.assertEqual(before_repo, self.digest_tree(self.repo))
        self.assertEqual(before_home, self.digest_tree(self.home))
        self.assertFalse(self.invocations.exists())

    def test_missing_git_blocks_only_explicit_source_inspection(self):
        result = self.invoke("--json", "--repo", str(self.repo), with_git=False)
        report = self.report(result)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(report["status"], "blocked")
        self.assertTrue(any("git not found" in item["detail"] for item in report["checks"]))

    def test_local_source_shape_and_full_sha_pin_pass(self):
        result = self.invoke(
            "--json", "--repo", str(self.repo), "--expect-commit", self.head
        )
        report = self.report(result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report["status"], "ok")
        self.assertIn("local HEAD " + self.head, " ".join(item["detail"] for item in report["checks"]))
        self.assertTrue(any(item["status"] == "matched" for item in report["checks"]))
        self.assertEqual(len([item for item in report["checks"] if item["name"].startswith("repo.file:")]), len(SOURCE_FILES))
        self.assertEqual(len([item for item in report["checks"] if item["name"].startswith("repo.dir:")]), len(SOURCE_DIRS))

    def test_pin_mismatch_blocks_without_echoing_file_contents(self):
        result = self.invoke(
            "--json", "--repo", str(self.repo), "--expect-commit", "f" * 40
        )
        report = self.report(result)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(report["status"], "blocked")
        self.assertNotIn("fixture source marker", result.stdout + result.stderr)

    def test_invalid_pin_arguments_return_two(self):
        for args in (
            ("--json", "--expect-commit", self.head),
            ("--json", "--repo", str(self.repo), "--expect-commit", "abc1234"),
            ("--json", "--unknown"),
        ):
            with self.subTest(args=args):
                result = self.invoke(*args)
                report = self.report(result)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertEqual(report["status"], "error")
                self.assertNotIn("Traceback", result.stderr)

    def test_missing_public_source_marker_blocks(self):
        (self.repo / "skills/krillinai-tts/SKILL.md").unlink()
        result = self.invoke("--json", "--repo", str(self.repo))
        report = self.report(result)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertTrue(any(item["status"] == "missing" for item in report["checks"]))

    def test_symlinked_public_marker_is_rejected(self):
        outside = self.work / "outside-readme.md"
        outside.write_text("do not follow", encoding="utf-8")
        marker = self.repo / "README.md"
        marker.unlink()
        marker.symlink_to(outside)
        result = self.invoke("--json", "--repo", str(self.repo))
        report = self.report(result)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertTrue(any("symlinked public source path rejected" in item["detail"] for item in report["checks"]))
        self.assertNotIn("do not follow", result.stdout + result.stderr)

    def test_oversized_public_marker_is_rejected_without_reading_it(self):
        marker = self.repo / "README.md"
        with marker.open("wb") as stream:
            stream.truncate(10_000_001)
        result = self.invoke("--json", "--repo", str(self.repo))
        report = self.report(result)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertTrue(any("exceeds the 10000000-byte limit" in item["detail"] for item in report["checks"]))

    def test_checkout_must_be_literal_git_top_level_not_a_symlink_or_subdirectory(self):
        alias = self.work / "repo-alias"
        alias.symlink_to(self.repo, target_is_directory=True)
        symlink_result = self.invoke("--json", "--repo", str(alias))
        symlink_report = self.report(symlink_result)
        self.assertEqual(symlink_result.returncode, 1)
        self.assertTrue(any("symlinked checkout path rejected" in item["detail"] for item in symlink_report["checks"]))

        nested = self.repo / "apps"
        nested_result = self.invoke("--json", "--repo", str(nested))
        nested_report = self.report(nested_result)
        self.assertEqual(nested_result.returncode, 1)
        self.assertTrue(any(item["name"] == "repo.root" and item["status"] == "mismatch" for item in nested_report["checks"]))

    def test_hostile_git_selectors_and_trace_variables_are_ignored(self):
        trace = self.work / "unexpected-git-trace.log"
        hostile = {
            "GIT_DIR": str(self.work / "wrong.git"),
            "GIT_WORK_TREE": str(self.work / "wrong-worktree"),
            "GIT_INDEX_FILE": str(self.work / "wrong-index"),
            "GIT_TRACE": str(trace),
            "GIT_TRACE_SETUP": "1",
            "GIT_TRACE2_EVENT": str(trace),
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.fsmonitor",
            "GIT_CONFIG_VALUE_0": "false",
            "GIT_ASKPASS": str(self.bin / "codex"),
            "SSH_ASKPASS": str(self.bin / "codex"),
            "LD_LIBRARY_PATH": str(self.work / "hostile-libraries"),
            "DYLD_LIBRARY_PATH": str(self.work / "hostile-libraries"),
            "DYLD_FALLBACK_LIBRARY_PATH": str(self.work / "hostile-fallbacks"),
        }
        result = self.invoke("--json", "--repo", str(self.repo), extra_env=hostile)
        report = self.report(result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report["status"], "ok")
        self.assertFalse(trace.exists())
        self.assertFalse(self.invocations.exists())

    def test_child_git_does_not_receive_credentials_or_hostile_selectors(self):
        log = self.work / "git-child-environment.jsonl"
        real_git = str(Path(self.git).resolve())
        shim = self.bin / "git"
        shim.unlink()
        child_keys = (
            "OPENAI_API_KEY",
            "AUTH_GOOGLE_ID",
            "GITHUB_TOKEN",
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_TRACE",
            "GIT_CONFIG_COUNT",
            "GIT_CONFIG_KEY_0",
            "GIT_CONFIG_VALUE_0",
            "GIT_ASKPASS",
            "SSH_ASKPASS",
            "LD_LIBRARY_PATH",
            "DYLD_LIBRARY_PATH",
            "DYLD_FALLBACK_LIBRARY_PATH",
        )
        script = [
            "#!/bin/sh",
            "{",
            *[
                "  printf '" + key + "=%s\\n' \"${" + key + "-<unset>}\""
                for key in child_keys
            ],
            "} >> " + shlex.quote(str(log)),
            "exec " + shlex.quote(real_git) + " \"$@\"",
            "",
        ]
        shim.write_text("\n".join(script), encoding="utf-8")
        shim.chmod(0o700)
        result = self.invoke(
            "--json",
            "--repo",
            str(self.repo),
            extra_env={
                "GIT_DIR": str(self.work / "wrong.git"),
                "GIT_WORK_TREE": str(self.work / "wrong-worktree"),
                "GIT_INDEX_FILE": str(self.work / "wrong-index"),
                "GIT_TRACE": str(self.work / "unexpected-trace.log"),
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "core.fsmonitor",
                "GIT_CONFIG_VALUE_0": "false",
                "GIT_ASKPASS": str(self.bin / "codex"),
                "SSH_ASKPASS": str(self.bin / "codex"),
                "LD_LIBRARY_PATH": str(self.work / "hostile-libraries"),
                "DYLD_LIBRARY_PATH": str(self.work / "hostile-libraries"),
                "DYLD_FALLBACK_LIBRARY_PATH": str(self.work / "hostile-fallbacks"),
            },
        )
        self.report(result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        observed = log.read_text(encoding="utf-8").splitlines()
        self.assertGreaterEqual(len(observed), 3 * len(child_keys))
        for key in child_keys:
            self.assertGreaterEqual(observed.count(f"{key}=<unset>"), 3, key)

    def test_helper_is_standalone_when_copied(self):
        copy = self.work / "copied-skill"
        shutil.copytree(PACKAGE, copy)
        copied_helper = copy / "scripts" / "preflight.py"
        result = self.invoke(
            "--json", "--repo", str(self.repo), "--expect-commit", self.head,
            helper=copied_helper,
        )
        self.report(result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_no_upstream_tools_run_no_secrets_print_and_no_repository_writes(self):
        before_repo = self.digest_tree(self.repo)
        before_home = self.digest_tree(self.home)
        result = self.invoke("--json", "--repo", str(self.repo), "--expect-commit", self.head)
        self.report(result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        combined = result.stdout + result.stderr
        for secret in (
            "SECRET_DO_NOT_ECHO_OPENAI",
            "SECRET_DO_NOT_ECHO_GOOGLE",
            "SECRET_DO_NOT_ECHO_GITHUB",
            "never-read-this-file",
        ):
            self.assertNotIn(secret, combined)
        self.assertEqual(before_repo, self.digest_tree(self.repo))
        self.assertEqual(before_home, self.digest_tree(self.home))
        self.assertFalse(self.invocations.exists())

    def test_source_pin_is_synchronized_across_operator_surfaces(self):
        skill_text = (PACKAGE / "SKILL.md").read_text(encoding="utf-8")
        reference_text = (PACKAGE / "references" / "upstream.md").read_text(encoding="utf-8")
        helper_text = HELPER.read_text(encoding="utf-8")
        toon_text = (PACKAGE / "SKILL.toon").read_text(encoding="utf-8")
        for text in (skill_text, reference_text, helper_text, toon_text):
            self.assertIn(PINNED_COMMIT, text)
        self.assertIn("v3.2.7", reference_text)

    def test_authored_eval_fixtures_are_structural_not_live_evaluations(self):
        payload = json.loads((PACKAGE / "evals" / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(payload.get("skill_name"), "opencreator")
        evals = payload.get("evals")
        self.assertIsInstance(evals, list)
        self.assertEqual(len(evals), 11)
        ids = [item.get("id") for item in evals]
        self.assertEqual(ids, list(range(1, 12)))
        for item in evals:
            with self.subTest(eval_id=item["id"]):
                self.assertTrue(item.get("prompt", "").strip())
                self.assertTrue(item.get("expected_output", "").strip())
                self.assertGreaterEqual(len(item.get("assertions", [])), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
