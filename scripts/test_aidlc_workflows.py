#!/usr/bin/env python3
"""Offline contract tests for the aidlc-workflows operator skill.

Covers the stdlib preflight helper (platform gating, installer prerequisites, root and sudo, existing
installs, environment disclosure, project inspection, checkout verification, audit probes), the skill's
catalog entry, and the documentation that names it. Nothing here runs `aidlc`, an installer, `gh`, a
harness or the network: executables on PATH are shims that record any execution.

Run from the repository root:

    python3 -B scripts/test_aidlc_workflows.py -v
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

ROOT = Path(__file__).resolve().parents[1]
NAME = "aidlc-workflows"
SKILL = ROOT / ".agent-skills" / NAME
HELPER = SKILL / "scripts" / "preflight.py"
COMMIT = "a8721be3631e6a254cf524ea57e5932aa56b4149"
SENTINEL = "SENTINEL-VALUE-4c1e"

_spec = importlib.util.spec_from_file_location("preflight_aidlc_workflows", HELPER)
helper = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(helper)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def frontmatter():
    return yaml.safe_load((SKILL / "SKILL.md").read_text(encoding="utf-8").split("---")[1])


class HelperCase(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="aidlc-skill-")
        self.addCleanup(temp.cleanup)
        self.tmp = Path(temp.name).resolve()
        self.home = self.tmp / "home"
        self.home.mkdir()
        self.shims = self.tmp / "shims"
        self.shims.mkdir()
        self.marker = self.tmp / "executed"
        # The installer's own prerequisites, so a bare PATH reports "ok" unless a test removes them.
        self.shim("curl", "sha256sum")

    def shim(self, *names, directory=None):
        directory = directory or self.shims
        directory.mkdir(parents=True, exist_ok=True)
        for name in names:
            path = directory / name
            path.write_text(f"#!/bin/sh\necho {name} >> '{self.marker}'\nexit 99\n", encoding="utf-8")
            path.chmod(0o755)

    def run_helper(self, *args, script=HELPER, path=None, env=None):
        environment = {"PATH": path if path is not None else str(self.shims), "HOME": str(self.home),
                       "PYTHONDONTWRITEBYTECODE": "1"}
        environment.update(env or {})
        return subprocess.run([sys.executable, "-B", str(script), *args], capture_output=True, text=True,
                              env=environment, timeout=60, encoding="utf-8")

    def report(self, *args, **kwargs):
        proc = self.run_helper("--json", *args, **kwargs)
        return proc, {c["name"]: c for c in json.loads(proc.stdout)["checks"]}

    def project(self, files):
        root = self.tmp / "project"
        for rel, data in files.items():
            target = root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))
        root.mkdir(exist_ok=True)
        return root

    def fixture(self, files, commit=COMMIT):
        """Copy the real helper beside a source.json built from `files`; return (helper, checkout)."""
        self.fixtures = getattr(self, "fixtures", 0) + 1
        base = self.tmp / f"fixture{self.fixtures}"
        skill = base / "skill"
        (skill / "scripts").mkdir(parents=True)
        (skill / "references").mkdir()
        shutil.copy(HELPER, skill / "scripts" / "preflight.py")
        source = {"schema_version": 1, "skill": NAME, "repository": "awslabs/aidlc-workflows", "commit": commit,
                  "license": {"spdx": "MIT-0"}, "files": [{"path": r, "sha256": sha256(d)} for r, d in files.items()]}
        (skill / "references" / "source.json").write_text(json.dumps(source), encoding="utf-8")
        checkout = base / "checkout"
        for rel, data in files.items():
            target = checkout / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        return skill / "scripts" / "preflight.py", checkout


class ContractTests(HelperCase):
    def test_json_report_has_the_shared_shape_and_nothing_on_path_is_executed(self):
        self.shim("aidlc", "claude", "kiro-cli", "codex", "opencode", "copilot", "agent", "gh", "git", "curl", "wget",
                  "sha256sum", "shasum")
        proc, checks = self.report()
        data = json.loads(proc.stdout)
        self.assertEqual((data["skill"], data["scope"], data["runtime_verified"]), (NAME, "offline-preflight", False))
        self.assertIn(data["status"], ("ok", "blocked"))
        self.assertEqual(proc.returncode, 0 if data["status"] == "ok" else 1, proc.stdout)
        self.assertIn("found at", checks["tool:aidlc"]["detail"])
        self.assertIn("version unverified", checks["tool:aidlc"]["detail"])
        self.assertFalse(self.marker.exists(), "the helper executed a discovered tool")

    def test_human_output_lists_every_check(self):
        proc = self.run_helper()
        self.assertTrue(proc.stdout.startswith(f"{NAME} offline-preflight: "), proc.stdout)
        self.assertIn("- source.pin: info - awslabs/aidlc-workflows @ " + COMMIT + " (MIT-0)", proc.stdout)

    def test_invalid_input_exits_two_without_a_traceback(self):
        cases = (("--expect-commit", COMMIT), ("--repo", str(self.tmp), "--expect-commit", "abc"), ("--bogus",))
        for args in cases:
            with self.subTest(args=args):
                proc = self.run_helper("--json", *args)
                self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
                self.assertNotIn("Traceback", proc.stderr)
                self.assertEqual(json.loads(proc.stdout)["status"], "error")

    def test_help_documents_every_flag(self):
        proc = self.run_helper("--help")
        self.assertEqual(proc.returncode, 0)
        for flag in ("--json", "--repo", "--expect-commit", "--project"):
            self.assertIn(flag, proc.stdout)


class HostTests(HelperCase):
    def checks_for(self, function, *args):
        checks = []
        function(checks, *args)
        return {c["name"]: c for c in checks}

    def test_supported_and_unsupported_platforms(self):
        supported = (("Darwin", "arm64"), ("Darwin", "x86_64"), ("Linux", "x86_64"), ("Linux", "aarch64"),
                     ("Windows", "AMD64"))
        unsupported = (("FreeBSD", "amd64"), ("Linux", "armv7l"), ("Linux", "i686"), ("Windows", "ARM64"), ("", ""))
        for system, machine in supported + unsupported:
            with self.subTest(system=system, machine=machine), \
                    mock.patch.object(helper.platform, "system", return_value=system), \
                    mock.patch.object(helper.platform, "machine", return_value=machine):
                state = self.checks_for(helper.platform_checks)["platform"]["status"]
                self.assertEqual(state, "ok" if (system, machine) in supported else "blocked")

    def test_musl_is_reported_only_when_a_musl_loader_exists(self):
        libs = self.tmp / "lib"
        libs.mkdir()
        with mock.patch.object(helper.platform, "system", return_value="Linux"), \
                mock.patch.object(helper.platform, "machine", return_value="x86_64"), \
                mock.patch.object(helper, "MUSL_DIRS", (str(libs),)):
            self.assertIn("glibc", self.checks_for(helper.platform_checks)["libc"]["detail"])
            (libs / "ld-musl-x86_64.so.1").write_bytes(b"")
            self.assertIn("libgcc", self.checks_for(helper.platform_checks)["libc"]["detail"])

    def test_installer_needs_a_checksum_tool_and_a_download_tool(self):
        tools = {"curl": "/bin/curl", "wget": "/bin/wget", "sha256sum": "/bin/sha256sum", "shasum": "/bin/shasum"}
        cases = (
            ({"curl", "sha256sum"}, "ok", "ok"), ({"wget", "shasum"}, "ok", "ok"),
            ({"curl"}, "blocked", "ok"), ({"sha256sum"}, "ok", "blocked"), (set(), "blocked", "blocked"),
        )
        for present, hasher, fetch in cases:
            with self.subTest(present=sorted(present)), \
                    mock.patch.object(helper.platform, "system", return_value="Linux"), \
                    mock.patch.object(helper.shutil, "which", side_effect=lambda n, p=present: tools[n] if n in p else None), \
                    mock.patch.object(helper.os, "geteuid", return_value=1000, create=True):
                found = self.checks_for(helper.installer_checks)
                self.assertEqual((found["installer.hash-tool"]["status"], found["installer.download-tool"]["status"]),
                                 (hasher, fetch))

    def test_windows_needs_neither_curl_nor_a_checksum_tool(self):
        with mock.patch.object(helper.platform, "system", return_value="Windows"), \
                mock.patch.object(helper.shutil, "which", return_value=None):
            found = self.checks_for(helper.installer_checks)
        self.assertEqual(list(found), ["installer"])
        self.assertEqual(found["installer"]["status"], "info")

    def test_root_is_informational_but_sudo_blocks(self):
        base = {"HOME": str(self.home)}
        for sudo, state in ((None, "info"), ("alice", "blocked")):
            with self.subTest(sudo=sudo), \
                    mock.patch.object(helper.platform, "system", return_value="Linux"), \
                    mock.patch.object(helper.shutil, "which", return_value="/bin/x"), \
                    mock.patch.object(helper.os, "geteuid", return_value=0, create=True), \
                    mock.patch.dict(os.environ, {**base, **({"SUDO_USER": sudo} if sudo else {})}, clear=False):
                if not sudo:
                    os.environ.pop("SUDO_USER", None)
                self.assertEqual(self.checks_for(helper.installer_checks)["installer.root"]["status"], state)

    def test_non_root_has_no_root_check(self):
        with mock.patch.object(helper.platform, "system", return_value="Linux"), \
                mock.patch.object(helper.shutil, "which", return_value="/bin/x"), \
                mock.patch.object(helper.os, "geteuid", return_value=1000, create=True):
            self.assertNotIn("installer.root", self.checks_for(helper.installer_checks))

    def test_existing_versions_list_only_release_ids_and_sorted(self):
        versions = self.home / ".local/share/aidlc/versions"
        for name in ("2.11.3", "2.10.0", "2.11.3-preview.20261103.1", "latest", "tmp.partial"):
            (versions / name).mkdir(parents=True)
        (versions / "2.9.0").write_bytes(b"a file, not a version directory")
        proc, checks = self.report()
        detail = checks["install.existing"]["detail"]
        self.assertIn("2.10.0, 2.11.3, 2.11.3-preview.20261103.1", detail)
        for ignored in ("latest", "tmp.partial", "2.9.0"):
            self.assertNotIn(ignored, detail)

    def test_an_aidlc_outside_the_default_bin_is_flagged_and_never_executed(self):
        other = self.tmp / "brew" / "bin"
        self.shim("aidlc", directory=other)
        proc, checks = self.report(path=str(other))
        self.assertIn("outside the default", checks["install.command"]["detail"])
        self.assertFalse(self.marker.exists())

    def test_an_aidlc_in_the_default_bin_is_not_flagged(self):
        self.shim("aidlc", directory=self.home / ".local" / "bin")
        proc, checks = self.report(path=str(self.home / ".local" / "bin"))
        self.assertNotIn("install.command", checks)

    def test_environment_report_never_prints_values(self):
        env = {"AIDLC_RELEASE_REPOSITORY": SENTINEL, "AIDLC_RELEASE_BASE_URL": SENTINEL,
               "AIDLC_SKIP_ARTIFACT_GUARD": SENTINEL, "AIDLC_DISABLE_SENSORS": "1", "AIDLC_DISABLE_LEARNINGS": "  "}
        proc, checks = self.report(env=env)
        self.assertNotIn(SENTINEL, proc.stdout + proc.stderr)
        self.assertIn("AIDLC_RELEASE_REPOSITORY=set", checks["env"]["detail"])
        self.assertIn("AIDLC_RELEASE_REPOSITORY", checks["env.trust-root"]["detail"])
        self.assertIn("AIDLC_RELEASE_BASE_URL", checks["env.trust-root"]["detail"])
        bypass = checks["env.guard-bypass"]["detail"]
        self.assertIn("AIDLC_DISABLE_SENSORS, AIDLC_SKIP_ARTIFACT_GUARD", bypass)
        self.assertNotIn("AIDLC_DISABLE_LEARNINGS", bypass.split(";")[0], "a blank value is not a bypass")

    def test_clean_environment_reports_no_trust_root_or_bypass(self):
        proc, checks = self.report()
        self.assertNotIn("env.trust-root", checks)
        self.assertIn("no AIDLC_SKIP_*", checks["env.guard-bypass"]["detail"])


MCP = {"mcpServers": {
    "context7": {"type": "http", "url": f"https://user:{SENTINEL}@mcp.context7.com/mcp",
                 "headers": {"CONTEXT7_API_KEY": SENTINEL}},
    "aws-iac": {"command": "uvx", "args": ["awslabs.aws-iac-mcp-server@latest"]},
    "pinned": {"command": "uvx", "args": ["tool==1.2.3"]},
}}
SETTINGS = {
    "permissions": {"allow": ["Edit(/**)", "Bash(bun .claude/tools/aidlc.ts engine *)", "Task", "WebSearch"]},
    "env": {"AWS_AIDLC_DEFAULT_SCOPE": "classic"},
    "hooks": {
        "Stop": [{"hooks": [{"type": "command", "command": "bun x/aidlc.ts engine hook continue-workflow"}]}],
        "PostToolUse": [{"matcher": "Write", "hooks": [{"type": "command", "command": "prettier --write"},
                                                       {"type": "command", "command": "bun x/aidlc.ts engine hook run-sensors"}]}],
    },
}


class ProjectTests(HelperCase):
    def inspect(self, files, **kwargs):
        root = self.project(files)
        proc, checks = self.report("--project", str(root), **kwargs)
        return proc, checks

    def test_a_configured_project_is_summarized_without_secret_values(self):
        files = {".aidlc-version": "2.11.3\n", ".claude/settings.json": json.dumps(SETTINGS), ".mcp.json": json.dumps(MCP),
                 ".claude/settings.local.json": json.dumps({"env": {"AWS_PROFILE": SENTINEL, "CLAUDE_CODE_USE_BEDROCK": SENTINEL}}),
                 "aidlc/spaces/default/memory/.keep": ""}
        proc, checks = self.inspect(files)
        self.assertEqual(proc.returncode, 0, proc.stdout)
        self.assertNotIn(SENTINEL, proc.stdout + proc.stderr)
        self.assertIn("aidlc, .claude", checks["project"]["detail"])
        self.assertIn("pinned to AI-DLC 2.11.3", checks["project.pin"]["detail"])
        self.assertIn("3 hook command(s) across 2 event(s), 2 of them run aidlc", checks["project.claude-hooks"]["detail"])
        permissions = checks["project.claude-permissions"]["detail"]
        self.assertIn("Edit(/**)", permissions)
        self.assertIn("Bash(bun .claude/tools/aidlc.ts engine *)", permissions)
        self.assertNotIn("Task", permissions)
        self.assertIn("CLAUDE_CODE_USE_BEDROCK, AWS_PROFILE", checks["project.bedrock-settings"]["detail"])
        mcp = checks["project.mcp:.mcp.json"]["detail"]
        self.assertIn("3 MCP server(s): aws-iac, context7, pinned", mcp)
        self.assertIn("unpinned `@latest` package: aws-iac", mcp)
        self.assertNotIn("pinned)", mcp.split("@latest")[1].split(";")[0])
        self.assertIn("context7 (mcp.context7.com)", mcp)

    def test_kiro_mcp_file_is_inspected_too(self):
        proc, checks = self.inspect({".kiro/settings/mcp.json": json.dumps(MCP)})
        self.assertIn("project.mcp:.kiro/settings/mcp.json", checks)
        self.assertIn(".kiro", checks["project"]["detail"])

    def test_pin_for_an_uninstalled_release_says_how_it_would_be_fetched(self):
        versions = self.home / ".local/share/aidlc/versions/2.10.0"
        versions.mkdir(parents=True)
        proc, checks = self.inspect({".aidlc-version": "2.11.3"})
        self.assertIn("not installed on this machine", checks["project.pin"]["detail"])
        (self.home / ".local/share/aidlc/versions/2.11.3").mkdir()
        proc, checks = self.inspect({".aidlc-version": "2.11.3"})
        self.assertNotIn("not installed", checks["project.pin"]["detail"])

    def test_an_unexpected_pin_is_never_echoed(self):
        proc, checks = self.inspect({".aidlc-version": f"{SENTINEL}; rm -rf /"})
        self.assertNotIn(SENTINEL, proc.stdout)
        self.assertIn("something other than a release id", checks["project.pin"]["detail"])

    def test_preview_pin_ids_are_accepted(self):
        proc, checks = self.inspect({".aidlc-version": "2.11.3-preview.20261103.1"})
        self.assertIn("pinned to AI-DLC 2.11.3-preview.20261103.1", checks["project.pin"]["detail"])

    def test_malformed_or_oversized_config_is_reported_not_crashed(self):
        proc, checks = self.inspect({".claude/settings.json": "{not json", ".mcp.json": "x" * (helper.MAX_CONFIG_BYTES + 10)})
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("not valid JSON", checks["project.claude-settings"]["detail"])
        self.assertIn("larger than", checks["project.mcp:.mcp.json"]["detail"])

    def test_non_object_json_is_reported_not_crashed(self):
        proc, checks = self.inspect({".claude/settings.json": "[1, 2]", ".mcp.json": '"text"'})
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("not a JSON object", checks["project.claude-settings"]["detail"])
        self.assertIn("registers no MCP servers", checks["project.mcp:.mcp.json"]["detail"])

    def test_unexpected_value_types_inside_settings_are_tolerated(self):
        weird = {"permissions": {"allow": "Edit(/**)"}, "hooks": {"Stop": "x", "Pre": [None, {"hooks": "y"}, {"hooks": [7]}]}}
        proc, checks = self.inspect({".claude/settings.json": json.dumps(weird),
                                     ".mcp.json": json.dumps({"mcpServers": {"a": 3, "b": {"args": "x", "url": 5}}})})
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("0 hook command(s)", checks["project.claude-hooks"]["detail"])
        self.assertIn("no Edit, Write or Bash permission", checks["project.claude-permissions"]["detail"])

    def test_symlinked_config_is_never_followed(self):
        outside = self.tmp / "outside.json"
        outside.write_text(json.dumps({"mcpServers": {SENTINEL: {}}}), encoding="utf-8")
        root = self.project({})
        (root / ".mcp.json").symlink_to(outside)
        proc, checks = self.report("--project", str(root))
        self.assertNotIn(SENTINEL, proc.stdout)
        self.assertRegex(checks["project.mcp:.mcp.json"]["detail"], "symlink|resolves outside")

    def test_a_symlinked_config_directory_cannot_escape_the_project(self):
        elsewhere = self.tmp / "elsewhere"
        (elsewhere).mkdir()
        (elsewhere / "settings.json").write_text(json.dumps({"permissions": {"allow": [f"Bash({SENTINEL})"]}}), encoding="utf-8")
        root = self.project({})
        (root / ".claude").symlink_to(elsewhere, target_is_directory=True)
        proc, checks = self.report("--project", str(root))
        self.assertNotIn(SENTINEL, proc.stdout)
        self.assertIn("resolves outside the project", checks["project.claude-settings"]["detail"])
        self.assertNotIn(".claude", checks["project"]["detail"])

    def test_missing_or_empty_projects(self):
        proc, checks = self.report("--project", str(self.tmp / "nope"))
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(checks["project"]["status"], "blocked")
        proc, checks = self.inspect({})
        self.assertEqual(proc.returncode, 0, proc.stdout)
        self.assertIn("none", checks["project"]["detail"])
        self.assertIn("no .aidlc-version pin", checks["project.pin"]["detail"])
        for absent in ("project.claude-hooks", "project.claude-permissions", "project.bedrock-settings"):
            self.assertNotIn(absent, checks)

    def test_project_inspection_writes_nothing(self):
        root = self.project({".claude/settings.json": json.dumps(SETTINGS), ".aidlc-version": "2.11.3"})
        before = sorted(str(p.relative_to(self.tmp)) for p in self.tmp.rglob("*"))
        self.report("--project", str(root))
        self.assertEqual(sorted(str(p.relative_to(self.tmp)) for p in self.tmp.rglob("*")), before)


class RepoTests(HelperCase):
    FILES = {"README.md": b"readme\n", "LICENSE": b"license\n", "docs/guide/x.md": b"guide\n"}

    def test_a_matching_checkout_passes(self):
        script, checkout = self.fixture(self.FILES)
        proc, checks = self.report("--repo", str(checkout), script=script)
        self.assertEqual(checks["repo.shape"]["status"], "ok", proc.stdout)
        self.assertEqual(checks["repo.files"]["status"], "ok", proc.stdout)
        self.assertEqual(checks["repo.commit"]["status"], "info")

    def test_a_modified_file_blocks(self):
        script, checkout = self.fixture(self.FILES)
        (checkout / "README.md").write_bytes(b"changed\n")
        proc, checks = self.report("--repo", str(checkout), script=script)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("README.md", checks["repo.files"]["detail"])

    def test_a_missing_file_blocks(self):
        script, checkout = self.fixture(self.FILES)
        (checkout / "docs/guide/x.md").unlink()
        proc, checks = self.report("--repo", str(checkout), script=script)
        self.assertEqual(checks["repo.shape"]["status"], "blocked")
        self.assertIn("missing docs/guide/x.md", checks["repo.shape"]["detail"])

    def test_a_symlinked_file_is_unsafe(self):
        script, checkout = self.fixture(self.FILES)
        outside = self.tmp / "outside"
        outside.write_bytes(b"readme\n")
        (checkout / "README.md").unlink()
        (checkout / "README.md").symlink_to(outside)
        proc, checks = self.report("--repo", str(checkout), script=script)
        self.assertEqual(checks["repo.shape"]["status"], "blocked")
        self.assertRegex(checks["repo.shape"]["detail"], "symlink|resolves outside")

    def test_expect_commit_without_git_cannot_be_verified(self):
        script, checkout = self.fixture(self.FILES)
        proc, checks = self.report("--repo", str(checkout), "--expect-commit", COMMIT, script=script)
        self.assertEqual(checks["repo.commit"]["status"], "blocked")
        self.assertIn("cannot be verified", checks["repo.commit"]["detail"])

    def test_git_head_is_compared_with_expect_commit(self):
        git = shutil.which("git")
        if not git:
            self.skipTest("git is not available")
        script, checkout = self.fixture(self.FILES)
        env = {"HOME": str(self.home), "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
        for command in (["init", "-q"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x"]):
            subprocess.run([git, *command], cwd=checkout, check=True, env={**os.environ, **env}, capture_output=True)
        head = subprocess.run([git, "rev-parse", "HEAD"], cwd=checkout, check=True, capture_output=True, text=True,
                              env={**os.environ, **env}).stdout.strip()
        path = f"{self.shims}{os.pathsep}{Path(git).parent}"
        proc, checks = self.report("--repo", str(checkout), "--expect-commit", head, script=script, path=path)
        self.assertEqual(checks["repo.commit"]["status"], "ok", proc.stdout)
        self.assertIn("differs from audited commit", checks["repo.commit"]["detail"])
        proc, checks = self.report("--repo", str(checkout), "--expect-commit", "0" * 40, script=script, path=path)
        self.assertEqual(checks["repo.commit"]["status"], "blocked")
        self.assertEqual(proc.returncode, 1)

    def test_the_real_pinned_manifest_lists_hashes_for_every_file(self):
        source = json.loads((SKILL / "references" / "source.json").read_text(encoding="utf-8"))
        self.assertEqual(source["commit"], COMMIT)
        self.assertRegex(source["commit"], r"^[0-9a-f]{40}$")
        self.assertEqual(source["license"]["spdx"], "MIT-0")
        self.assertEqual(len({e["path"] for e in source["files"]}), len(source["files"]))
        for entry in source["files"]:
            self.assertRegex(entry["sha256"], r"^[0-9a-f]{64}$", entry["path"])
        self.assertEqual(source["latest_release"]["tag_commit"], COMMIT)
        self.assertNotEqual(source["main_observed"]["commit"], COMMIT)


PROBE_CASES = {
    "claude-preapproval": ("harness/claude/settings.json", '{"permissions":{"allow":["Edit(/**)"]}}', '{"permissions":{"allow":["Task"]}}'),
    "claude-hooks": ("harness/claude/settings.json", '"command": "bun a"\n' * 9, '"command": "bun a"\n' * 8),
    "claude-mcp-unpinned": ("harness/claude/.mcp.json", '"args": ["awslabs.x@latest"]', '"args": ["awslabs.x==1.0.0"]'),
    "readme-pipe-install": ("README.md", "curl -fsSL https://x/install.sh | sh", "sh install.sh"),
    "provenance-optional": ("docs/guide/18-install-and-lifecycle.md", "provenance\nverification is skipped", "provenance verification runs"),
    "no-os-signing": ("docs/guide/18-install-and-lifecycle.md", "code-signing and\nnotarization are not part", "the release is notarized"),
    "kiro-harness-ids": ("README.md", "aidlc config --harness kiro-ide", "aidlc config --harness kiro-v2"),
}


class ProbeTests(HelperCase):
    def probe(self, name, content):
        path = PROBE_CASES[name][0]
        script, checkout = self.fixture({path: content.encode("utf-8")})
        proc, checks = self.report("--repo", str(checkout), script=script)
        return checks["audit:" + name]["detail"]

    def test_every_probe_has_a_hit_and_a_miss_case(self):
        self.assertEqual({p["name"] for p in helper.PROBES}, set(PROBE_CASES))

    def test_each_probe_reports_its_hit_and_its_miss_text(self):
        wanted = {p["name"]: p for p in helper.PROBES}
        for name, (_, hit, miss) in PROBE_CASES.items():
            with self.subTest(name=name):
                self.assertEqual(self.probe(name, hit), wanted[name]["hit"])
                self.assertEqual(self.probe(name, miss), wanted[name]["miss"])

    def test_probes_for_absent_files_are_not_assessed(self):
        script, checkout = self.fixture({"README.md": b"x"})
        proc, checks = self.report("--repo", str(checkout), script=script)
        self.assertIn("not assessed", checks["audit:claude-preapproval"]["detail"])
        self.assertEqual(checks["audit:claude-preapproval"]["status"], "info")


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))
        cls.live = {s["name"] for s in cls.manifest["skills"]}
        cls.skill_md = (SKILL / "SKILL.md").read_text(encoding="utf-8")

    def test_skill_files_exist(self):
        for rel in ("SKILL.md", "SKILL.toon", "evals/evals.json", "references/upstream.md", "references/source.json",
                    "scripts/preflight.py"):
            self.assertTrue((SKILL / rel).is_file(), rel)
        self.assertTrue(os.access(HELPER, os.X_OK))

    def test_frontmatter_follows_the_skill_standard(self):
        front = frontmatter()
        self.assertEqual(front["name"], NAME)
        self.assertRegex(front["name"], r"^[a-z0-9]+(-[a-z0-9]+)*$")
        description = " ".join(front["description"].split())
        self.assertLessEqual(len(description), 1024)
        self.assertIn("Triggers on:", description)
        self.assertIn("Do not use", description)
        self.assertEqual(front["license"], "MIT-0")
        self.assertEqual(front["metadata"]["upstream_commit"], COMMIT)
        self.assertEqual(front["metadata"]["source"], "https://github.com/awslabs/aidlc-workflows")
        self.assertLess(len(self.skill_md.splitlines()), 200)
        for heading in ("## When to use this skill", "## Instructions", "## Examples", "## Best practices", "## References"):
            self.assertIn(heading, self.skill_md)

    def test_manifest_entry_and_relationship_group(self):
        entry = next(s for s in self.manifest["skills"] if s["name"] == NAME)
        front = frontmatter()
        self.assertEqual(entry["description"], " ".join(front["description"].split()))
        self.assertEqual((entry["category"], entry["subcategory"]), ("ai-agents", "orchestration"))
        self.assertIn(NAME, self.manifest["categories"]["ai-agents"])
        self.assertIn(NAME, self.manifest["subcategories"]["ai-agents"]["orchestration"])
        self.assertEqual(self.manifest["skill_count"], len(self.manifest["skills"]))
        group = self.manifest["relationship_groups"]["structured-delivery-methods"]
        self.assertIn(NAME, group["members"])
        self.assertLessEqual(set(group["members"]), self.live)

    def test_route_outs_name_live_skills(self):
        for target in ("spec-kit", "bmad", "task-planning"):
            self.assertIn(target, self.live)
            self.assertIn(f"`{target}`", self.skill_md)

    def test_evals_are_well_formed_and_route_away_from_spec_kit(self):
        data = json.loads((SKILL / "evals" / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(data["skill_name"], NAME)
        ids = [e["id"] for e in data["evals"]]
        self.assertEqual(len(ids), len(set(ids)))
        for item in data["evals"]:
            self.assertTrue(item["prompt"] and item["expected_output"])
            self.assertGreaterEqual(len(item["assertions"]), 2, item["id"])
        self.assertTrue(any("spec-kit" in " ".join(e["assertions"]) for e in data["evals"]))

    def test_documented_helper_flags_exist_in_help(self):
        help_text = subprocess.run([sys.executable, "-B", str(HELPER), "--help"], capture_output=True, text=True).stdout
        guide = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        section = guide.split("### AI-DLC workflows operator")[1].split("\n---\n")[0]
        for label, text in (("SKILL.md", self.skill_md), ("setup guide", section)):
            blocks = re.findall(r"```bash\n(.*?)```", text, re.S)
            commands = " ".join(" ".join(b.replace("\\\n", " ").split()) for b in blocks)
            lines = [line for line in re.split(r"python3 ", commands) if "preflight.py" in line]
            self.assertTrue(lines, label)
            flags = {flag for line in lines for flag in re.findall(r"--[a-z][a-z-]*", line)}
            for flag in sorted(flags):
                with self.subTest(source=label, flag=flag):
                    self.assertIn(flag, help_text)

    def test_local_links_resolve(self):
        for target in re.findall(r"\]\(((?:references|scripts|evals)/[^)#]+)", self.skill_md):
            self.assertTrue((SKILL / target).is_file(), target)

    def test_reference_counts_match_the_manifest(self):
        source = json.loads((SKILL / "references" / "source.json").read_text(encoding="utf-8"))
        counts = source["counts_at_pin"]
        reference = (SKILL / "references" / "upstream.md").read_text(encoding="utf-8")
        self.assertIn(f"{counts['agents']} agent files", reference)
        self.assertIn(f"{counts['scopes']} profile", reference)
        self.assertIn(f"{counts['stages']} stage files", reference)
        self.assertEqual(sum(counts["stages_by_phase"].values()), counts["stages"])
        for profile in ("classic", "express", "feature", "enterprise", "mvp", "poc", "bugfix", "refactor", "infra",
                        "security-patch", "workshop"):
            self.assertIn(f"`{profile}`", self.skill_md)
        self.assertEqual(len(source["harness_ids_at_pin"]), 7)

    def test_documentation_names_the_skill_and_its_pin(self):
        for readme in ("README.md", "README.ko.md", "README.es-ES.md"):
            self.assertIn(f"| `{NAME}` |", (ROOT / readme).read_text(encoding="utf-8"), readme)
        for changelog in ("en", "ko"):
            text = (ROOT / "changelog" / changelog / "2026-11.md").read_text(encoding="utf-8")
            self.assertIn(f"`{NAME}`", text, changelog)
            self.assertIn("test_aidlc_workflows.py", text)
        guide = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        self.assertIn("### AI-DLC workflows operator", guide)
        self.assertIn(COMMIT, guide)
        self.assertIn(f"jeo-skill.py\" install {NAME} --global --yes", guide)
        attribution = (ROOT / "docs" / "attribution.md").read_text(encoding="utf-8")
        self.assertIn(f"| `{NAME}` |", attribution)
        self.assertIn(COMMIT[:7], attribution)

    def test_ci_runs_this_suite(self):
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("python3 -B scripts/test_aidlc_workflows.py -v", workflow)

    def test_no_credential_shaped_strings_ship_with_the_skill(self):
        pattern = re.compile(r"(?i)(sk-[a-z0-9]{16,}|ghp_[a-z0-9]{20,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY)")
        for path in SKILL.rglob("*"):
            if path.is_file():
                self.assertIsNone(pattern.search(path.read_text(encoding="utf-8")), str(path))


if __name__ == "__main__":
    unittest.main()
