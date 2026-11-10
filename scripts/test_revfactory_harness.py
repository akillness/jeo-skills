#!/usr/bin/env python3
"""Offline contracts for the revfactory/harness operator; no provider or plugin runs."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import yaml

ROOT = Path(__file__).resolve().parents[1]
NAME = "revfactory-harness"
SKILL = ROOT / ".agent-skills" / NAME
HELPER = SKILL / "scripts" / "preflight.py"
PIN = "92d9f1b29e7af81acebf51a9fcd1832e739a1414"
GIT = shutil.which("git")
SPEC = importlib.util.spec_from_file_location("revfactory_preflight", HELPER)
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)


class HelperTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="revfactory-contract-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.home = self.root / "home"
        self.home.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.marker = self.root / "executed"
        self.claude = self.bin / "claude"
        self.claude.write_text(f"#!/bin/sh\ntouch '{self.marker}'\nexit 99\n", encoding="utf-8")
        self.claude.chmod(0o755)
        self.env = {"PATH": str(self.bin), "HOME": str(self.home), "PYTHONDONTWRITEBYTECODE": "1"}
        self.env.update({key: os.environ[key] for key in ("SystemRoot", "WINDIR") if key in os.environ})

    def run_helper(self, *args, script=HELPER, env=None):
        return subprocess.run([sys.executable, "-B", str(script), *args],
                              capture_output=True, text=True, timeout=15, env=env or self.env)

    def json_report(self, *args, **kwargs):
        done = self.run_helper("--json", *args, **kwargs)
        self.assertNotIn("Traceback", done.stderr)
        return done, json.loads(done.stdout)

    def source_fixture(self):
        self.assertIsNotNone(GIT, "Git is required for checkout identity contract tests")
        package = self.root / "package"
        (package / "scripts").mkdir(parents=True)
        (package / "references").mkdir()
        script = package / "scripts/preflight.py"
        shutil.copy2(HELPER, script)
        repo = self.root / "checkout"
        repo.mkdir()
        files = {"README_KO.md": b"public source\n", "skills/harness/SKILL.md": b"factory\n"}
        for name, data in files.items():
            target = repo / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        git_env = {"PATH": str(Path(GIT).parent), "HOME": str(self.home),
                   "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
        for args in (("init", "--quiet"), ("add", "."),
                     ("-c", "user.name=Contract Test", "-c", "user.email=contract@example.invalid",
                      "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture")):
            subprocess.run([GIT, *args], cwd=repo, env=git_env, check=True,
                           capture_output=True, text=True)
        pin = subprocess.run([GIT, "rev-parse", "HEAD"], cwd=repo, env=git_env,
                             check=True, capture_output=True, text=True).stdout.strip()
        source = {"schema_version": 1, "skill": NAME, "repository": "revfactory/harness", "commit": pin,
                  "files": [{"path": name, "sha256": hashlib.sha256(data).hexdigest()}
                            for name, data in files.items()]}
        manifest = package / "references/source.json"
        manifest.write_text(json.dumps(source), encoding="utf-8")
        env = dict(self.env, PATH=str(self.bin) + os.pathsep + str(Path(GIT).parent))
        return script, repo, pin, manifest, env

    def test_host_report_is_json_and_never_executes_claude(self):
        done, data = self.json_report()
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(data["skill"], NAME)
        self.assertEqual(data["scope"], "offline-preflight")
        self.assertEqual(data["status"], "ok")
        self.assertIs(data["runtime_verified"], False)
        self.assertFalse(self.marker.exists())
        self.assertFalse(any(self.home.iterdir()))

    def test_missing_claude_is_blocked_not_runtime_verified(self):
        self.claude.unlink()
        done, data = self.json_report()
        self.assertEqual(done.returncode, 1)
        self.assertEqual(data["status"], "blocked")
        self.assertIs(data["runtime_verified"], False)

    def test_plain_text_mode_preserves_the_status(self):
        done = self.run_helper()
        self.assertEqual(done.returncode, 0)
        self.assertIn(NAME + " offline-preflight: ok", done.stdout)

    def test_help_exposes_every_documented_flag(self):
        done = self.run_helper("--help")
        self.assertEqual(done.returncode, 0)
        for flag in ("--json", "--repo", "--expect-commit", "--project"):
            self.assertIn(flag, done.stdout)

    def test_invalid_arguments_still_emit_json(self):
        done, data = self.json_report("--not-a-flag")
        self.assertEqual(done.returncode, 2)
        self.assertEqual(data["status"], "error")

    def test_expected_commit_requires_repo_and_full_sha(self):
        for args in (("--expect-commit", PIN), ("--repo", str(self.root), "--expect-commit", "short")):
            with self.subTest(args=args):
                done, data = self.json_report(*args)
                self.assertEqual(done.returncode, 2)
                self.assertEqual(data["status"], "error")

    def test_regular_pinned_checkout_passes_real_git_and_hash_checks(self):
        script, repo, pin, _, env = self.source_fixture()
        done, data = self.json_report("--repo", str(repo), "--expect-commit", pin, script=script, env=env)
        self.assertEqual(done.returncode, 0, data)
        checks = {c["name"]: c for c in data["checks"]}
        self.assertEqual(checks["repo.commit"]["status"], "ok")
        self.assertEqual(checks["repo.file:README_KO.md"]["status"], "ok")
        self.assertFalse(self.marker.exists())

    def test_modified_file_is_blocked_even_when_head_matches(self):
        script, repo, pin, _, env = self.source_fixture()
        (repo / "README_KO.md").write_bytes(b"edited bytes\n")
        done, data = self.json_report("--repo", str(repo), "--expect-commit", pin, script=script, env=env)
        self.assertEqual(done.returncode, 1)
        self.assertTrue(any(c["name"] == "repo.file:README_KO.md" and c["status"] == "blocked" for c in data["checks"]))

    def test_mismatched_head_is_blocked_even_when_files_match(self):
        script, repo, _, _, env = self.source_fixture()
        done, data = self.json_report("--repo", str(repo), "--expect-commit", "f" * 40, script=script, env=env)
        self.assertEqual(done.returncode, 1)
        self.assertTrue(any(c["name"] == "repo.commit" and c["status"] == "blocked" for c in data["checks"]))

    def test_checkout_without_git_cannot_claim_pin_verification(self):
        script, repo, _, _, env = self.source_fixture()
        shutil.rmtree(repo / ".git")
        done, data = self.json_report("--repo", str(repo), script=script, env=env)
        self.assertEqual(done.returncode, 1)
        self.assertEqual(data["status"], "blocked")

    def test_missing_source_file_is_blocked(self):
        script, repo, _, _, env = self.source_fixture()
        (repo / "README_KO.md").unlink()
        done, data = self.json_report("--repo", str(repo), script=script, env=env)
        self.assertEqual(done.returncode, 1)
        self.assertTrue(any(c["name"] == "repo.file:README_KO.md" and c["status"] == "blocked" for c in data["checks"]))

    def test_source_file_symlink_is_rejected_even_with_matching_bytes(self):
        script, repo, _, _, env = self.source_fixture()
        original = repo / "README_KO.md"
        outside = self.root / "outside"
        outside.write_bytes(original.read_bytes())
        original.unlink()
        original.symlink_to(outside)
        done, data = self.json_report("--repo", str(repo), script=script, env=env)
        self.assertEqual(done.returncode, 1)
        self.assertIn("symlinked public path", done.stdout)

    def test_intermediate_source_directory_symlink_is_rejected(self):
        script, repo, _, _, env = self.source_fixture()
        outside = self.root / "moved-skills"
        (repo / "skills").rename(outside)
        (repo / "skills").symlink_to(outside, target_is_directory=True)
        done, _ = self.json_report("--repo", str(repo), script=script, env=env)
        self.assertEqual(done.returncode, 1)
        self.assertIn("symlinked public path", done.stdout)

    def test_oversized_public_file_is_blocked_without_reading_it(self):
        public = self.root / "large"
        with public.open("wb") as stream:
            stream.truncate(helper.MAX_BYTES + 1)
        data, reason = helper.regular_bytes(self.root, public.name)
        self.assertIsNone(data)
        self.assertIn("size limit", reason)

    @unittest.skipUnless(hasattr(os, "mkfifo"), "FIFO is a POSIX contract")
    def test_special_file_is_rejected_without_blocking(self):
        fifo = self.root / "fifo"
        os.mkfifo(fifo)
        data, reason = helper.regular_bytes(self.root, fifo.name)
        self.assertIsNone(data)
        self.assertEqual(reason, "not a regular file")

    def test_repo_symlink_and_non_directory_are_blocked(self):
        link = self.root / "linked-root"
        link.symlink_to(self.home, target_is_directory=True)
        file = self.root / "file"
        file.write_text("not a directory", encoding="utf-8")
        for path in (link, file, self.root / "missing"):
            with self.subTest(path=path):
                done, data = self.json_report("--repo", str(path))
                self.assertEqual(done.returncode, 1)
                self.assertEqual(data["status"], "blocked")

    def test_git_subprocess_environment_is_sanitized_and_bounded(self):
        complete = subprocess.CompletedProcess([], 0, str(self.root) + "\n" + PIN + "\n", "")
        with mock.patch.dict(os.environ, {"GIT_DIR": "/untrusted", "GIT_WORK_TREE": "/untrusted",
                                         "GIT_CONFIG_COUNT": "1", "GH_TOKEN": "private-sentinel"}):
            with mock.patch.object(helper.subprocess, "run", return_value=complete) as run:
                self.assertEqual(helper.git_identity(self.root, GIT), PIN)
        arguments, kwargs = run.call_args
        self.assertEqual(arguments[0][-3:], ["rev-parse", "--show-toplevel", "HEAD"])
        self.assertEqual(kwargs["timeout"], 5)
        self.assertEqual(kwargs["env"]["GIT_ALLOW_PROTOCOL"], "")
        self.assertEqual(kwargs["env"]["GIT_CONFIG_GLOBAL"], os.devnull)
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_CONFIG_COUNT", "GH_TOKEN"):
            self.assertNotIn(key, kwargs["env"])

    def test_git_timeout_and_wrong_root_are_unverified(self):
        with mock.patch.object(helper.subprocess, "run", side_effect=subprocess.TimeoutExpired("git", 5)):
            self.assertIsNone(helper.git_identity(self.root, GIT))
        done = subprocess.CompletedProcess([], 0, str(self.home) + "\n" + PIN + "\n", "")
        with mock.patch.object(helper.subprocess, "run", return_value=done):
            self.assertIsNone(helper.git_identity(self.root, GIT))

    def test_invalid_or_missing_manifest_is_a_structured_error(self):
        script, _, _, manifest, _ = self.source_fixture()
        manifest.write_text("{broken", encoding="utf-8")
        done, data = self.json_report(script=script)
        self.assertEqual(done.returncode, 2)
        self.assertEqual(data["status"], "error")
        manifest.unlink()
        done, _ = self.json_report(script=script)
        self.assertEqual(done.returncode, 2)

    def test_manifest_rejects_unsafe_paths_and_duplicate_records(self):
        for path in ("../secret", "/absolute", "a/../../secret", "a\\secret"):
            source = {"schema_version": 1, "skill": NAME, "repository": "revfactory/harness", "commit": PIN,
                      "files": [{"path": path, "sha256": "a" * 64}]}
            manifest = self.root / "source.json"
            manifest.write_text(json.dumps(source), encoding="utf-8")
            with self.subTest(path=path), mock.patch.object(helper, "SOURCE", manifest):
                with self.assertRaises(ValueError):
                    helper.load_source()
        source["files"] = [{"path": "README.md", "sha256": "a" * 64}] * 2
        manifest.write_text(json.dumps(source), encoding="utf-8")
        with mock.patch.object(helper, "SOURCE", manifest), self.assertRaises(ValueError):
            helper.load_source()

    def test_new_project_is_inspected_without_creating_files(self):
        before = sorted(self.home.iterdir())
        done, data = self.json_report("--project", str(self.home))
        self.assertEqual(done.returncode, 0, data)
        self.assertEqual(sorted(self.home.iterdir()), before)
        self.assertIn("absent; creation requires a scoped request", done.stdout)

    def test_existing_direct_copy_names_are_reported_not_overwritten(self):
        for name in ("harness", "harness-evolve", "evolve"):
            destination = self.home / ".claude/skills" / name
            destination.mkdir(parents=True)
            (destination / "SKILL.md").write_text("foreign user skill", encoding="utf-8")
        done, data = self.json_report("--project", str(self.home))
        self.assertEqual(done.returncode, 0)
        warnings = [c for c in data["checks"] if c["name"].startswith("project.collision:")]
        self.assertEqual(len(warnings), 3)
        self.assertTrue(all(c["status"] == "warning" for c in warnings))
        self.assertEqual((self.home / ".claude/skills/harness/SKILL.md").read_text(), "foreign user skill")

    def test_symlinked_project_and_claude_root_are_blocked(self):
        link = self.root / "project-link"
        link.symlink_to(self.home, target_is_directory=True)
        done, _ = self.json_report("--project", str(link))
        self.assertEqual(done.returncode, 1)
        (self.home / ".claude").symlink_to(self.bin, target_is_directory=True)
        done, data = self.json_report("--project", str(self.home))
        self.assertEqual(done.returncode, 1)
        self.assertFalse(any(c["name"].startswith("project.collision:") for c in data["checks"]))

    def test_symlinked_skill_root_and_claude_file_are_blocked(self):
        (self.home / ".claude").mkdir()
        (self.home / ".claude/skills").symlink_to(self.bin, target_is_directory=True)
        (self.home / "CLAUDE.md").symlink_to(self.claude)
        done, data = self.json_report("--project", str(self.home))
        self.assertEqual(done.returncode, 1)
        blocked = {c["name"] for c in data["checks"] if c["status"] == "blocked"}
        self.assertIn("project.path:.claude/skills", blocked)
        self.assertIn("project.path:CLAUDE.md", blocked)

    def test_project_credentials_are_never_opened_or_printed(self):
        secret = "private-contract-sentinel"
        (self.home / ".env").write_text(secret, encoding="utf-8")
        (self.home / ".claude").mkdir()
        (self.home / ".claude/settings.local.json").write_text(secret, encoding="utf-8")
        done, data = self.json_report("--project", str(self.home), env=dict(self.env, ANTHROPIC_API_KEY=secret))
        self.assertEqual(done.returncode, 0, data)
        self.assertNotIn(secret, done.stdout + done.stderr)
        self.assertEqual((self.home / ".env").read_text(), secret)
        self.assertFalse(self.marker.exists())


class PackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        cls.front = yaml.safe_load(cls.text.split("---", 2)[1])
        cls.manifest = json.loads((ROOT / ".agent-skills/skills.json").read_text(encoding="utf-8"))
        cls.entry = next(s for s in cls.manifest["skills"] if s["name"] == NAME)

    def test_standard_frontmatter_and_progressive_sections(self):
        self.assertEqual(self.front["name"], NAME)
        self.assertLessEqual(len(" ".join(self.front["description"].split())), 1024)
        self.assertEqual(self.front["license"], "Apache-2.0")
        self.assertEqual(self.front["metadata"]["upstream_commit"], PIN)
        self.assertLess(len(self.text.splitlines()), 200)
        self.assertFalse({"category", "subcategory", "tags", "relationships"} & self.front.keys())
        for heading in ("When to use this skill", "Instructions", "Examples", "Best practices", "References"):
            self.assertIn("## " + heading, self.text)

    def test_manifest_metadata_and_all_memberships_match(self):
        self.assertEqual(self.entry["description"], " ".join(self.front["description"].split()))
        self.assertEqual(self.entry["version"], self.front["metadata"]["version"])
        self.assertEqual(self.entry["source"], self.front["metadata"]["source"])
        self.assertEqual((self.entry["category"], self.entry["subcategory"]), ("ai-agents", "orchestration"))
        self.assertIn(NAME, self.manifest["categories"]["ai-agents"])
        self.assertIn(NAME, self.manifest["subcategories"]["ai-agents"]["orchestration"])
        self.assertEqual(self.manifest["skill_count"], len(self.manifest["skills"]))
        self.assertIn(NAME, self.manifest["relationship_groups"]["harness-project-operators"]["members"])

    def test_retired_name_and_existing_harness2_are_not_replaced(self):
        self.assertEqual(self.manifest["retired_skills"]["harness"]["replacement"], "harness2")
        names = {s["name"] for s in self.manifest["skills"]}
        self.assertIn("harness2", names)
        self.assertNotIn("harness", names)
        self.assertFalse((ROOT / ".agent-skills/harness").exists())
        for target in ("harness2", "skill-standardization", "ruflo"):
            self.assertIn(target, names)
            self.assertIn(f"`{target}`", self.front["description"])

    def test_support_files_and_local_links_resolve(self):
        for name in ("SKILL.toon", "scripts/preflight.py", "references/upstream.md", "references/workflow.md",
                     "references/source.json", "evals/evals.json"):
            self.assertTrue((SKILL / name).is_file(), name)
        self.assertTrue(os.access(HELPER, os.X_OK))
        for link in re.findall(r"\]\(((?:references|scripts|evals)/[^)#]+)", self.text):
            self.assertTrue((SKILL / link).is_file(), link)

    def test_source_manifest_covers_both_skills_and_public_contracts(self):
        source = helper.load_source()
        self.assertEqual(source["commit"], PIN)
        self.assertEqual(source["upstream_version"], "2.1.0")
        self.assertEqual(source["license"]["spdx"], "Apache-2.0")
        self.assertEqual(len(source["files"]), 18)
        paths = {item["path"] for item in source["files"]}
        self.assertLessEqual({"README_KO.md", "LICENSE", ".claude-plugin/plugin.json",
                              ".claude-plugin/marketplace.json", "skills/harness/SKILL.md",
                              "skills/evolve/SKILL.md", "skills/harness/references/skill-writing-guide.md"}, paths)

    def test_behavioral_evals_cover_near_misses_and_capability_failures(self):
        data = json.loads((SKILL / "evals/evals.json").read_text(encoding="utf-8"))
        self.assertEqual(data["skill_name"], NAME)
        self.assertEqual(len(data["evals"]), 10)
        self.assertEqual(len({e["id"] for e in data["evals"]}), len(data["evals"]))
        for case in data["evals"]:
            self.assertTrue(case["prompt"] and case["expected_output"])
            self.assertGreaterEqual(len(case["assertions"]), 2)
        assertions = " ".join(a for e in data["evals"] for a in e["assertions"])
        for phrase in ("harness2", "skill-standardization", "ruflo", "Workflow as unavailable", "runtime_verified false"):
            self.assertIn(phrase, assertions)

    def test_readme_projections_and_setup_explain_activation_boundary(self):
        for name in ("README.md", "README.ko.md", "README.es-ES.md"):
            text = (ROOT / name).read_text(encoding="utf-8")
            self.assertIn(f"| `{NAME}` |", text, name)
            self.assertIn(PIN, text, name)
        guide = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        section = guide.split("### Revfactory Harness team-architecture factory (on demand)", 1)[1].split("\n### ", 1)[0]
        for token in (PIN, "--dry-run", "--yes", "runtime_verified", "not", "activation", "Workflow"):
            self.assertIn(token, section)
        self.assertIn(NAME, (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"))
        self.assertIn(PIN, (ROOT / "docs/attribution.md").read_text(encoding="utf-8"))

    def test_documented_flags_are_real_and_ci_runs_this_suite(self):
        help_text = subprocess.run([sys.executable, "-B", str(HELPER), "--help"],
                                   capture_output=True, text=True, check=True).stdout
        for flag in set(re.findall(r"--(?:json|repo|expect-commit|project)\b", self.text)):
            self.assertIn(flag, help_text)
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        self.assertIn("python3 -B scripts/test_revfactory_harness.py -v", workflow)


if __name__ == "__main__":
    unittest.main()
