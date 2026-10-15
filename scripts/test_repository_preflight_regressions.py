#!/usr/bin/env python3
"""Black-box regression tests for standalone offline repository preflights.

Run: python3 scripts/test_repository_preflight_regressions.py -v

Every assertion exercises the helper as a real subprocess.  The fixture PATH
contains only inert command shims (plus the real git binary for source
inspection); no upstream executable is allowed to run.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = (
    "openrig",
    "anyjev",
    "typesafe-computer-use",
    "zurp",
    "helix-foundry",
    "uzu",
    "context-mode",
    "rea",
    "fineenvs",
    "llmfit",
    "pg-jev",
    "okf-agent-memory",
)

# Public source markers used by the twelve helpers.  The superset lets each
# helper enforce its own source contract without the test inventing a fake
# success condition for one particular implementation.
PUBLIC_MARKERS = (
    "README.md", "LICENSE", "package.json", "pyproject.toml", "Cargo.toml",
    "Makefile", "build.gradle.kts", "docker-compose.yml", ".config/platforms.toml",
    "jev.control", "sql/jev--0.2.1.sql",
    "scripts/rea.mjs", "scripts/postinstall.mjs",
    "src/server.ts", "src/cli.ts", "docs/platform-support.md",
    "docs/levels.md", "docs/limitations.md",
    "00-environments-101/README.md", "00-environments-101/project.yaml",
    "bug-bounty-research/README.md", "bug-bounty-research/package.json",
    "bug-bounty-research/.mcp.json", "bug-bounty-research/src/.keep",
    "bug-bounty-research/skills/.keep",
    "typesafe_computer_use/cli.py", "typesafe_computer_use/config.py",
    "typesafe_computer_use/decide.py", "typesafe_computer_use/actions.py",
    "typesafe_computer_use/runner.py", "typesafe_computer_use/writer.py",
    "docs/how-a-step-works.md", "docs/browser-backend.md",
    "docs/writer-endpoints.md", "docs/run-folder.md",
    "anyjev/__init__.py", "anyjev/tacit.py", "anyjev/serve.py", "anyjev/backends/vllm.py",
    "anyjev/backends/sglang.py", "anyjev/backends/llamacpp.py", "tacit.py", "serve.py",
    "backends/vllm.py", "backends/sglang.py", "backends/llamacpp.py",
    "openrig/package.json", "packages/cli/package.json", "scripts/install.sh",
    "docs/reference/rig-spec.md", "llmfit-core/Cargo.toml", "llmfit-tui/Cargo.toml",
    "docs/cli.md", "docs/how-it-works.md", "docs/platform-support.md",
    "src/main.rs", "src/lib.rs", "src/bin/llmfit.rs", "src/rea/__init__.py",
    "projects/wordle/README.md", "projects/wordle/project.yaml",
    "01-latex-ocr/README.md", "01-latex-ocr/project.yaml",
    "project/README.md", "project/project.yaml", "apps/api/README.md", "compose.yaml",
    "rea-agents/package.json", "bin/llmfit", "scripts/check_server.sh",
    "extension/build.gradle.kts", "docs/README.md", "AGENTS.md", "docs/API.md",
    "docs/OPERATIONS.md", "docs/HOSTING.md", "apps/api/src/app.ts",
    "apps/api/src/store.ts", "scripts/backup.sh", "scripts/restore.sh",
    "scripts/upgrade.sh", "scripts/setup.sh",
    "go.mod", "docs/guides/GETTING_STARTED.md", "docs/guides/CLI.md",
    "docs/security/SECURITY.md", ".agents/skills/okf-memory/SKILL.md",
)

# Names are deliberately broad: a correct helper may inspect their presence,
# but must never execute them during an offline inventory.
TRAPPED_TOOLS = (
    "openrig", "rig", "tmux", "anyjev", "okf", "go", "vllm", "sglang", "llama-cli",
    "llama-server", "clicker", "clicker-bench", "jev", "java", "gradle",
    "node", "npm", "npx", "bun", "context-mode", "ctx", "rea", "rea-agents",
    "ghidra", "ida", "jadx", "binwalk", "unblob", "uv", "mirai", "cargo",
    "rustc", "fineenvs", "llmfit", "pg_config", "make", "psql", "docker",
    "docker-compose", "bash", "openssl", "python", "python3",
)


class RepositoryPreflightRegressions(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="preflight-regressions-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.home = self.work / "home"
        self.bin = self.work / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.invocations = self.work / "invocations.jsonl"
        self.secret = self.home / "secret-marker"
        self.marker = self.work / "injection-marker"
        self._make_tool_shims()
        self.base_env = {
            "PATH": "",
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "PYTHONPATH": "",
            "PYTHONDONTWRITEBYTECODE": "1",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": str(self.work / "empty-git-config"),
            "GIT_TERMINAL_PROMPT": "0",
            # A helper reading either value would violate its public contract.
            "TYPESAFE_API_KEY": "fixture-secret-do-not-read",
            "HF_TOKEN": "fixture-secret-do-not-read",
            "OPENAI_API_KEY": "fixture-secret-do-not-read",
        }

    def _make_tool_shims(self) -> None:
        real_python = Path(sys.executable)
        for name in TRAPPED_TOOLS:
            path = self.bin / name
            path.write_text(
                "#!" + str(real_python) + "\n"
                "import json, os, sys\n"
                "with open(os.environ['PREFLIGHT_INVOCATIONS'], 'a') as f:\n"
                "    f.write(json.dumps([os.path.basename(sys.argv[0]), *sys.argv[1:]]) + '\\n')\n"
                "raise SystemExit(97)\n"
            )
            path.chmod(0o700)
        git = shutil.which("git")
        if git:
            (self.bin / "git").unlink(missing_ok=True)
            (self.bin / "git").symlink_to(git)
        # Helpers inspect PATH for the interpreter but must not invoke it.
        for name in ("python", "python3"):
            (self.bin / name).unlink(missing_ok=True)
            (self.bin / name).symlink_to(real_python)

    def env(self, with_tools: bool = False, **extra: str) -> dict[str, str]:
        value = dict(self.base_env)
        value["PATH"] = str(self.bin) if with_tools else ""
        value["PREFLIGHT_INVOCATIONS"] = str(self.invocations)
        value.update(extra)
        return value

    def helper(self, skill: str) -> Path:
        return ROOT / ".agent-skills" / skill / "scripts" / "preflight.py"

    def invoke(self, skill: str, *args: str, with_tools: bool = False) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(self.helper(skill)), *args],
            cwd=self.work,
            env=self.env(with_tools=with_tools),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
        )

    def report(self, result: subprocess.CompletedProcess[str]) -> dict:
        try:
            value = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            self.fail(f"expected one JSON report, got {result.stdout!r}; stderr={result.stderr!r}: {exc}")
        self.assertIsInstance(value, dict)
        self.assertIn("skill", value)
        self.assertEqual(value["scope"], "offline-preflight")
        self.assertIn(value["status"], {"ok", "blocked", "error"})
        self.assertIsInstance(value["checks"], list)
        self.assertFalse(value["runtime_verified"])
        return value

    def test_all_helpers_support_help_without_dependencies(self):
        for skill in SKILLS:
            with self.subTest(skill=skill):
                result = self.invoke(skill, "--help")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("--json", result.stdout)
                self.assertIn("--repo", result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_empty_path_is_blocked_and_never_crashes(self):
        for skill in SKILLS:
            with self.subTest(skill=skill):
                result = self.invoke(skill, "--json")
                report = self.report(result)
                self.assertEqual(report["skill"], skill)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertEqual(report["status"], "blocked")
                self.assertTrue(report["checks"])
                self.assertNotIn("Traceback", result.stderr)

    def test_invalid_pin_and_pin_without_repo_are_json_errors(self):
        for skill in SKILLS:
            with self.subTest(skill=skill):
                malformed = self.invoke(skill, "--json", "--expect-commit", "not-a-sha")
                malformed_report = self.report(malformed)
                self.assertEqual(malformed.returncode, 2)
                self.assertEqual(malformed_report["status"], "error")
                full_sha = "a" * 40
                empty = self.invoke(skill, "--json", "--expect-commit", "")
                empty_report = self.report(empty)
                self.assertEqual(empty.returncode, 2)
                self.assertEqual(empty_report["status"], "error")
                no_repo = self.invoke(skill, "--json", "--expect-commit", full_sha)
                no_repo_report = self.report(no_repo)
                self.assertEqual(no_repo.returncode, 2)
                self.assertEqual(no_repo_report["status"], "error")

    def test_missing_and_malformed_repo_are_rejected_without_writes(self):
        missing = self.work / "missing repo $(touch injection-marker)"
        regular_file = self.work / "not-a-repository"
        regular_file.write_text("not a directory")
        before = self._snapshot()
        for skill in SKILLS:
            with self.subTest(skill=skill, case="missing"):
                result = self.invoke(skill, "--json", "--repo", str(missing), with_tools=True)
                report = self.report(result)
                self.assertIn(result.returncode, (1, 2))
                self.assertIn(report["status"], {"blocked", "error"})
                self.assertFalse(self.marker.exists())
            with self.subTest(skill=skill, case="regular-file"):
                result = self.invoke(skill, "--json", "--repo", str(regular_file), with_tools=True)
                report = self.report(result)
                self.assertIn(result.returncode, (1, 2))
                self.assertIn(report["status"], {"blocked", "error"})
                self.assertFalse(self.marker.exists())
        self.assertEqual(self._snapshot(), before)

    def test_literal_repo_path_with_spaces_and_metacharacters(self):
        repo = self.make_git_fixture('source [literal] $(touch injection-marker) "quoted"')
        before = self._snapshot()
        for skill in SKILLS:
            with self.subTest(skill=skill):
                result = self.invoke(skill, "--json", "--repo", str(repo), with_tools=True)
                report = self.report(result)
                self.assertIn(result.returncode, (0, 1))
                self.assertNotEqual(report["status"], "error")
                shape_checks = [check for check in report["checks"]
                                if any(token in str(check.get("name", "")).lower()
                                       for token in ("shape", "structure", "repo.file", "source:"))]
                self.assertTrue(shape_checks, report)
                self.assertFalse(any(check.get("status") in {"blocked", "missing", "mismatch", "invalid"}
                                     for check in shape_checks), report)
                self.assertFalse(self.marker.exists())
        self.assertEqual(self._snapshot(), before)

    def test_expected_pin_matches_real_local_git_without_running_upstream_tools(self):
        repo = self.make_git_fixture("pinned source")
        commit = self.git(repo, "rev-parse", "HEAD")
        for skill in SKILLS:
            with self.subTest(skill=skill):
                before = self._snapshot()
                result = self.invoke(skill, "--json", "--repo", str(repo), "--expect-commit", commit,
                                  with_tools=True)
                report = self.report(result)
                self.assertIn(result.returncode, (0, 1))
                self.assertNotEqual(report["status"], "error")
                commit_checks = [
                    check for check in report["checks"]
                    if any(token in str(check.get("name", "")).lower()
                           for token in ("commit", "git", "head", "revision"))
                ]
                self.assertTrue(commit_checks, report)
                self.assertTrue(any(check.get("status") in {"matched", "ok", "detected"}
                                    for check in commit_checks), report)
                local_checks = [check for check in report["checks"]
                                if any(token in str(check.get("name", "")).lower()
                                       for token in ("repo", "source", "shape", "structure", "commit", "git", "head"))]
                self.assertTrue(local_checks, report)
                self.assertFalse(any(check.get("status") in {"blocked", "missing", "mismatch", "invalid", "error"}
                                     for check in local_checks), report)
                self.assertEqual(self._read_invocations(), [])
                self.assertEqual(self._snapshot(), before)

    def test_zurp_surface_selection_avoids_unselected_toolchains(self):
        for surface, selected, excluded in (
            ("mcp", ("node", "npm"), ("java", "gradle")),
            ("burp", ("java", "gradle"), ("node", "npm")),
        ):
            with self.subTest(surface=surface):
                surface_bin = self.work / (surface + "-bin")
                surface_bin.mkdir()
                for name in (*selected, "git"):
                    (surface_bin / name).symlink_to(self.bin / name)
                env = self.env(with_tools=False)
                env["PATH"] = str(surface_bin)
                result = subprocess.run(
                    [sys.executable, str(self.helper("zurp")), "--json", "--surface", surface],
                    cwd=self.work,
                    env=env,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=10,
                )
                report = self.report(result)
                self.assertEqual(result.returncode, 0, report)
                self.assertEqual(report["status"], "ok", report)
                self.assertEqual(next(check["status"] for check in report["checks"]
                                      if check["name"] == "surface"), "ok")
                names = {check["name"] for check in report["checks"]}
                tool_names = names & {"java", "gradle", "node", "npm"}
                self.assertEqual(tool_names, set(selected))
                self.assertEqual(names & set(excluded), set())
                self.assertEqual(self._read_invocations(), [])

        invalid = self.invoke("zurp", "--json", "--surface", "invalid")
        invalid_report = self.report(invalid)
        self.assertEqual(invalid.returncode, 2)
        self.assertEqual(invalid_report["status"], "error")

    def test_wrong_expected_pin_blocks_and_does_not_execute_upstream(self):
        repo = self.make_git_fixture("mismatch source")
        wrong = "b" * 40
        for skill in SKILLS:
            with self.subTest(skill=skill):
                result = self.invoke(skill, "--json", "--repo", str(repo), "--expect-commit", wrong,
                                  with_tools=True)
                report = self.report(result)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(report["status"], "blocked")
                self.assertEqual(self._read_invocations(), [])

    def test_okf_agent_memory_rejects_symlinked_and_oversized_source_markers(self):
        repo = self.make_git_fixture("symlink leaf source")
        pin = self.git(repo, "rev-parse", "HEAD")
        outside = self.work / "outside-secret-marker"
        outside.write_text("fixture secret that must not appear in output")
        marker = repo / ".agents" / "skills" / "okf-memory" / "SKILL.md"
        marker.unlink()
        marker.symlink_to(outside)
        before = self._snapshot()
        result = self.invoke("okf-agent-memory", "--json", "--repo", str(repo),
                             "--expect-commit", pin, with_tools=True)
        report = self.report(result)
        self.assertEqual(result.returncode, 1, report)
        leaf = next(check for check in report["checks"] if check["name"] == "structure:.agents/skills/okf-memory/SKILL.md")
        self.assertEqual(leaf["status"], "unsafe-symlink")
        self.assertNotIn("fixture secret", result.stdout + result.stderr)
        self.assertEqual(self._snapshot(), before)

        parent_repo = self.make_git_fixture("symlink parent source")
        parent_pin = self.git(parent_repo, "rev-parse", "HEAD")
        outside_agents = self.work / "outside-agents" / ".agents"
        (outside_agents / "skills" / "okf-memory").mkdir(parents=True)
        (outside_agents / "skills" / "okf-memory" / "SKILL.md").write_text("do not follow this link")
        agents = parent_repo / ".agents"
        agents.rename(parent_repo / ".agents-saved")
        agents.symlink_to(outside_agents, target_is_directory=True)
        before = self._snapshot()
        result = self.invoke("okf-agent-memory", "--json", "--repo", str(parent_repo),
                             "--expect-commit", parent_pin, with_tools=True)
        report = self.report(result)
        self.assertEqual(result.returncode, 1, report)
        parent_check = next(check for check in report["checks"]
                            if check["name"] == "structure:.agents/skills/okf-memory/SKILL.md")
        self.assertEqual(parent_check["status"], "unsafe-symlink")
        self.assertNotIn("do not follow this link", result.stdout + result.stderr)
        self.assertEqual(self._snapshot(), before)

        checkout_parent_link = self.work / "checkout-parent-link"
        checkout_parent_link.symlink_to(self.work, target_is_directory=True)
        alias_root = checkout_parent_link / parent_repo.name
        before = self._snapshot()
        result = self.invoke("okf-agent-memory", "--json", "--repo", str(alias_root),
                             "--expect-commit", parent_pin, with_tools=True)
        report = self.report(result)
        self.assertEqual(result.returncode, 1, report)
        root_check = next(check for check in report["checks"] if check["name"] == "repo")
        self.assertEqual(root_check["status"], "unsafe-symlink")
        self.assertFalse(any(check["name"] == "git-head" for check in report["checks"]))
        self.assertEqual(self._snapshot(), before)
        self.assertEqual(self._read_invocations(), [])

        oversized_repo = self.make_git_fixture("oversized source marker")
        oversized_pin = self.git(oversized_repo, "rev-parse", "HEAD")
        (oversized_repo / "README.md").write_bytes(b"x" * (1024 * 1024 + 1))
        before = self._snapshot()
        result = self.invoke("okf-agent-memory", "--json", "--repo", str(oversized_repo),
                             "--expect-commit", oversized_pin, with_tools=True)
        report = self.report(result)
        self.assertEqual(result.returncode, 1, report)
        size_check = next(check for check in report["checks"] if check["name"] == "structure:README.md")
        self.assertEqual(size_check["status"], "oversized")
        self.assertEqual(self._snapshot(), before)
        self.assertEqual(self._read_invocations(), [])

    def test_git_environment_cannot_forge_repo_or_write_trace_files(self):
        repo_a = self.make_git_fixture("repo A")
        repo_b = self.make_git_fixture("repo B")
        (repo_a / "revision-a.txt").write_text("A\n")
        self.git(repo_a, "add", "revision-a.txt")
        self.git(repo_a, "commit", "--quiet", "-m", "revision A")
        (repo_b / "revision-b.txt").write_text("B\n")
        self.git(repo_b, "add", "revision-b.txt")
        self.git(repo_b, "commit", "--quiet", "-m", "revision B")
        pin_a = self.git(repo_a, "rev-parse", "HEAD")
        pin_b = self.git(repo_b, "rev-parse", "HEAD")
        self.assertNotEqual(pin_a, pin_b)
        trace_dir = self.work / "trace-output"
        trace_dir.mkdir()
        for skill in SKILLS:
            with self.subTest(skill=skill):
                env = self.env(
                    with_tools=True,
                    GIT_DIR=str(repo_b / ".git"),
                    GIT_WORK_TREE=str(repo_b),
                    GIT_TRACE=str(trace_dir / (skill + ".trace")),
                    GIT_TRACE2=str(trace_dir / (skill + ".trace2")),
                )
                result = subprocess.run(
                    [sys.executable, str(self.helper(skill)), "--json", "--repo", str(repo_a),
                     "--expect-commit", pin_a],
                    cwd=self.work, env=env, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
                )
                report = self.report(result)
                commit_checks = [check for check in report["checks"]
                                 if any(token in str(check.get("name", "")).lower()
                                        for token in ("commit", "git", "head", "revision"))]
                self.assertTrue(any(check.get("status") in {"matched", "ok", "detected"}
                                    for check in commit_checks), report)
                self.assertFalse(any(path.exists() for path in trace_dir.iterdir()))
                wrong = subprocess.run(
                    [sys.executable, str(self.helper(skill)), "--json", "--repo", str(repo_a),
                     "--expect-commit", pin_b],
                    cwd=self.work, env=env, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
                )
                wrong_report = self.report(wrong)
                self.assertEqual(wrong.returncode, 1, wrong_report)
                self.assertEqual(wrong_report["status"], "blocked", wrong_report)
                self.assertEqual(self._read_invocations(), [])
                self.assertFalse(any(path.exists() for path in trace_dir.iterdir()))
                git_dir_only = dict(env)
                git_dir_only.pop("GIT_WORK_TREE", None)
                dir_only = subprocess.run(
                    [sys.executable, str(self.helper(skill)), "--json", "--repo", str(repo_a),
                     "--expect-commit", pin_a],
                    cwd=self.work, env=git_dir_only, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
                )
                dir_only_report = self.report(dir_only)
                dir_only_commits = [check for check in dir_only_report["checks"]
                                    if any(token in str(check.get("name", "")).lower()
                                           for token in ("commit", "git", "head", "revision"))]
                self.assertTrue(any(check.get("status") in {"matched", "ok", "detected"}
                                    for check in dir_only_commits), dir_only_report)
                dir_only_wrong = subprocess.run(
                    [sys.executable, str(self.helper(skill)), "--json", "--repo", str(repo_a),
                     "--expect-commit", pin_b],
                    cwd=self.work, env=git_dir_only, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
                )
                dir_only_wrong_report = self.report(dir_only_wrong)
                self.assertEqual(dir_only_wrong.returncode, 1, dir_only_wrong_report)
                self.assertEqual(dir_only_wrong_report["status"], "blocked", dir_only_wrong_report)
                self.assertEqual(self._read_invocations(), [])
                self.assertFalse(any(path.exists() for path in trace_dir.iterdir()))

    def test_git_child_does_not_receive_provider_secrets(self):
        repo = self.make_git_fixture("secret forwarding repo")
        pin = self.git(repo, "rev-parse", "HEAD")
        real_git = shutil.which("git")
        self.assertIsNotNone(real_git)
        probe_bin = self.work / "git-probe-bin"
        probe_bin.mkdir()
        for entry in self.bin.iterdir():
            if entry.name != "git":
                (probe_bin / entry.name).symlink_to(entry)
        probe_log = self.work / "git-probe.jsonl"
        (probe_bin / "git").write_text(
            "#!" + str(sys.executable) + "\n"
            "import json, os, subprocess, sys\n"
            "keys = ('OPENAI_API_KEY', 'AWS_SECRET_ACCESS_KEY', 'FOUNDRY_API_KEY')\n"
            "with open(" + repr(str(probe_log)) + ", 'a') as stream:\n"
            "    json.dump({key: key in os.environ for key in keys}, stream)\n"
            "    stream.write('\\n')\n"
            "raise SystemExit(subprocess.run([" + repr(real_git) + ", *sys.argv[1:]], "
            "env=os.environ.copy(), check=False).returncode)\n"
        )
        (probe_bin / "git").chmod(0o700)
        env = self.env(
            with_tools=False,
            PATH=str(probe_bin),
            OPENAI_API_KEY="synthetic-openai-secret",
            AWS_SECRET_ACCESS_KEY="synthetic-aws-secret",
            FOUNDRY_API_KEY="synthetic-foundry-secret",
        )
        for skill in SKILLS:
            with self.subTest(skill=skill):
                result = subprocess.run(
                    [sys.executable, str(self.helper(skill)), "--json", "--repo", str(repo),
                     "--expect-commit", pin],
                    cwd=self.work, env=env, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
                )
                report = self.report(result)
                commit_checks = [check for check in report["checks"]
                                 if any(token in str(check.get("name", "")).lower()
                                        for token in ("commit", "git", "head", "revision"))]
                self.assertTrue(any(check.get("status") in {"matched", "ok", "detected"}
                                    for check in commit_checks), report)
        records = [json.loads(line) for line in probe_log.read_text().splitlines()]
        self.assertGreaterEqual(len(records), len(SKILLS))
        for record in records:
            self.assertEqual(record, {
                "OPENAI_API_KEY": False,
                "AWS_SECRET_ACCESS_KEY": False,
                "FOUNDRY_API_KEY": False,
            })

    def test_copied_helper_has_no_hidden_sibling_dependency(self):
        for skill in SKILLS:
            with self.subTest(skill=skill):
                copied = self.work / "standalone" / skill / "preflight.py"
                copied.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.helper(skill), copied)
                result = subprocess.run(
                    [sys.executable, str(copied), "--json"], cwd=self.work,
                    env=self.env(), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    timeout=10,
                )
                report = self.report(result)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(report["skill"], skill)
                self.assertEqual(report["status"], "blocked")
                self.assertNotIn("Traceback", result.stderr)

    def test_default_audit_never_invokes_upstream_executables_or_reads_secret_files(self):
        self.secret.write_text("do not read")
        before = self._snapshot()
        for skill in SKILLS:
            with self.subTest(skill=skill):
                result = self.invoke(skill, "--json", with_tools=True)
                report = self.report(result)
                self.assertNotIn("fixture-secret-do-not-read", result.stdout)
                self.assertNotIn("fixture-secret-do-not-read", result.stderr)
                self.assertNotIn("do not read", result.stdout)
                self.assertNotIn("do not read", result.stderr)
                self.assertEqual(self._read_invocations(), [])
                self.assertTrue(self.secret.exists())
                self.assertEqual(self._snapshot(), before)

    def make_git_fixture(self, name: str) -> Path:
        repo = self.work / name
        repo.mkdir(parents=True)
        for marker in PUBLIC_MARKERS:
            path = repo / marker
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.name == "package.json":
                path.write_text('{"name":"fixture","version":"0.0.0","bin":{"fixture":"cli.js"}}\n')
            else:
                path.write_text("public fixture marker\n")
        self.git(repo, "init", "--quiet")
        self.git(repo, "config", "user.name", "offline-fixture")
        self.git(repo, "config", "user.email", "offline-fixture@example.invalid")
        self.git(repo, "add", ".")
        self.git(repo, "commit", "--quiet", "-m", "fixture")
        return repo

    def git(self, cwd: Path, *args: str) -> str:
        git = shutil.which("git")
        if not git:
            self.skipTest("git is required to construct isolated source fixture")
        result = subprocess.run(
            [git, "-C", str(cwd), *args], cwd=self.work,
            env=self.env(with_tools=True), text=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, check=True, timeout=10,
        )
        return result.stdout.strip()

    def _read_invocations(self) -> list[list[str]]:
        if not self.invocations.exists():
            return []
        return [json.loads(line) for line in self.invocations.read_text().splitlines()]

    def _snapshot(self) -> dict[str, bytes]:
        result: dict[str, bytes] = {}
        for path in self.work.rglob("*"):
            if path.is_file() and path != self.invocations and ".git" not in path.parts:
                result[str(path.relative_to(self.work))] = path.read_bytes()
        return result


if __name__ == "__main__":
    unittest.main(verbosity=2)
