#!/usr/bin/env python3
"""Black-box offline tests for the knowledge repository operator preflights.

Run with: python3 -B scripts/test_knowledge_repository_skills.py -v
All helper calls are isolated subprocesses; source fixtures are synthetic and
never require network access or upstream programs.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SKILLS = (
    "orionbelt-ontology-builder", "open-ontologies", "semantica", "utopia",
    "hyper-extract", "agentic-graphrag-blueprint", "codebase-memory-mcp",
    "memmachine", "memori", "memsearch", "rowboat",
    "ai-knowledge-management-platform", "knowledge-catalog", "pixeltable",
    "leann", "turbovec", "cocoindex", "pixelrag", "agent-beacon",
)
FIXTURE_FILES = {
    "README.md": b"synthetic public README\n",
    "src/module.py": b"synthetic public module\n",
}
SECRET = "fixture-secret-should-never-be-printed"


def resolved_temp_root(path: str | os.PathLike[str]) -> Path:
    """Resolve macOS /var -> /private/var aliases before building symlinks."""
    return Path(path).resolve()


class KnowledgeRepositoryPreflightTests(unittest.TestCase):
    maxDiff = None

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="knowledge-preflight-")
        self.addCleanup(self.temp.cleanup)
        self.work = resolved_temp_root(self.temp.name)
        self.home = self.work / "home"
        self.home.mkdir()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.invocations = self.work / "invocations.log"
        self.source = self.work / "synthetic-source"
        self.source.mkdir()
        # A fake git selector must be irrelevant: this is a file-pin checker,
        # not a Git revision or whole-tree verifier.
        (self.source / ".git").mkdir()
        (self.source / ".git" / "HEAD").write_text("ref: refs/heads/unrelated\\n", encoding="utf-8")
        self._write_source()
        (self.source / "unlisted-private-like.bin").write_bytes(b"unlisted file is outside the pin set")
        self.base_env = dict(os.environ)
        self.base_env.update({
            "PATH": "",
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "PYTHONDONTWRITEBYTECODE": "1",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": str(self.work / "empty-git-config"),
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_DIR": str(self.work / "hostile-git-dir"),
            "GIT_WORK_TREE": str(self.work / "hostile-work-tree"),
            "GIT_INDEX_FILE": str(self.work / "hostile-index"),
            "GIT_OBJECT_DIRECTORY": str(self.work / "hostile-objects"),
            "GIT_TRACE": str(self.home / "git-trace-secret-path"),
            "GIT_TRACE_SETUP": str(self.home / "git-setup-secret-path"),
            "GIT_TRACE_PACKET": str(self.home / "git-packet-secret-path"),
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.sshCommand",
            "GIT_CONFIG_VALUE_0": "touch " + str(self.work / "git-config-sentinel"),
            "PREFLIGHT_SENTINEL": str(self.work / "upstream-ran"),
            "PREFLIGHT_SECRET": SECRET,
        })
        self._write_sentinel_tools()

    def _write_source(self) -> None:
        for name, payload in FIXTURE_FILES.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)

    def _write_sentinel_tools(self) -> None:
        script = (
            "#!" + sys.executable + "\n"
            "import os\n"
            "with open(os.environ['PREFLIGHT_SENTINEL'], 'a') as f: f.write('ran\\n')\n"
            "raise SystemExit(91)\n"
        )
        for name in ("python", "python3", "git", "git-lfs", "node", "npm", "npx", "uv", "pip", "pip3", "docker", "bash"):
            shim = self.bin / name
            shim.write_text(script, encoding="utf-8")
            shim.chmod(0o700)

    def env(self, *, path: Path | None = None, **extra: str) -> dict[str, str]:
        env = dict(self.base_env)
        env["PATH"] = str(path) if path is not None else ""
        env.update(extra)
        return env

    def helper(self, skill: str) -> Path:
        return ROOT / ".agent-skills" / skill / "scripts" / "preflight.py"

    def invoke_path(self, script: Path, *args: str, path: Path | None = None,
                    cwd: Path | None = None, env: dict[str, str] | None = None,
                    timeout: int = 8) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-B", str(script), *args], cwd=cwd or self.work,
            env=env or self.env(path=path), text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
            check=False,
        )

    def invoke(self, skill: str, *args: str, **kwargs) -> subprocess.CompletedProcess[str]:
        return self.invoke_path(self.helper(skill), *args, **kwargs)

    def report(self, result: subprocess.CompletedProcess[str]) -> dict:
        try:
            value = json.loads(result.stdout)
        except (ValueError, TypeError) as exc:
            self.fail(f"expected JSON stdout, got {result.stdout!r}; stderr={result.stderr!r}: {exc}")
        self.assertIsInstance(value, dict)
        self.assertIs(value.get("runtime_verified"), False)
        self.assertIs(value.get("whole_revision_verified"), False)
        self.assertIs(value.get("tool_versions_verified"), False)
        return value

    def make_package(self, name: str = "fixture-package", helper_source: Path | None = None) -> Path:
        package = self.work / name
        (package / "scripts").mkdir(parents=True)
        (package / "references").mkdir()
        helper = helper_source or self.helper("orionbelt-ontology-builder")
        shutil.copyfile(helper, package / "scripts" / "preflight.py")
        (package / "scripts" / "preflight.py").chmod(0o755)
        self.write_manifest(package)
        return package

    def write_manifest(self, package: Path, files: dict[str, bytes] | None = None,
                       *, skill: str | None = None, repository: str = "fixture/source",
                       commit: str = "a" * 40) -> dict:
        files = FIXTURE_FILES if files is None else files
        rows = []
        for name, payload in files.items():
            rows.append({
                "path": name,
                "sha256": hashlib.sha256(payload).hexdigest(),
                "url": f"https://github.com/{repository}/blob/{commit}/{quote(name, safe='/')}",
                "purpose": "synthetic offline test fixture",
            })
        manifest = {
            "schema_version": 1,
            "skill": skill or package.name,
            "repository": repository,
            "commit": commit,
            "observed_at": "2026-01-02T03:04:05Z",
            "tools": [{"name": "python3", "purpose": "discovery only"},
                      {"name": "knowledge-index", "purpose": "optional discovery only"}],
            "files": rows,
        }
        (package / "references" / "source.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return manifest

    def snapshot(self, root: Path) -> tuple:
        result = []
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                result.append((str(path.relative_to(root)), "symlink", os.readlink(path)))
            elif path.is_file():
                result.append((str(path.relative_to(root)), "file", hashlib.sha256(path.read_bytes()).hexdigest(),
                               stat.S_IMODE(path.stat().st_mode)))
            elif path.is_dir():
                result.append((str(path.relative_to(root)), "dir"))
        return tuple(result)

    def test_all_nineteen_helpers_are_identical_executable_and_metadata_consistent(self):
        helpers = [self.helper(name) for name in SKILLS]
        self.assertEqual(len(helpers), 19)
        for helper in helpers:
            self.assertTrue(helper.is_file(), str(helper))
            self.assertTrue(helper.stat().st_mode & stat.S_IXUSR, f"not executable: {helper}")
        baseline = helpers[0].read_bytes()
        self.assertTrue(all(path.read_bytes() == baseline for path in helpers[1:]),
                        "the 19 standalone helper copies differ")
        for skill in SKILLS:
            with self.subTest(skill=skill):
                package = self.helper(skill).parent.parent
                manifest_path = package / "references" / "source.json"
                skill_md = package / "SKILL.md"
                self.assertTrue(manifest_path.is_file(), f"missing {manifest_path}")
                self.assertTrue(skill_md.is_file(), f"missing {skill_md}")
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertEqual(manifest.get("skill"), skill)
                commit = manifest.get("commit", "")
                repository = manifest.get("repository", "")
                self.assertRegex(commit, r"^[0-9a-f]{40}$")
                self.assertRegex(repository, r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
                self.assertTrue(1 <= len(manifest.get("files", [])) <= 12)
                seen = set()
                for item in manifest["files"]:
                    p = item["path"]
                    self.assertNotIn(p, seen)
                    seen.add(p)
                    self.assertRegex(item.get("sha256", ""), r"^[0-9a-f]{64}$")
                    self.assertEqual(item.get("url"),
                                     f"https://github.com/{repository}/blob/{commit}/{quote(p, safe='/')}")
                docs = skill_md.read_text(encoding="utf-8")
                self.assertIn(skill, docs)
                self.assertIn("source.json", docs)
                self.assertIn(commit, docs)
                self.assertIn("evals/evals.json", docs)
                self.assertTrue((package / "references" / "upstream.md").is_file())
                cases = json.loads((package / "evals" / "evals.json").read_text(encoding="utf-8"))
                self.assertIsInstance(cases, list)
                self.assertEqual(len(cases), 6)
                self.assertEqual(len({case["id"] for case in cases}), 6)
                for case in cases:
                    for field in ("id", "prompt", "expected_skill", "expected_behavior"):
                        self.assertIsInstance(case[field], str)
                        self.assertTrue(case[field].strip())

    def test_all_nineteen_real_packages_default_inventory_is_offline_and_nonblocking(self):
        tool_name = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$")
        for skill in SKILLS:
            with self.subTest(skill=skill):
                helper = self.helper(skill)
                manifest_path = helper.parent.parent / "references" / "source.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                tools = manifest.get("tools")
                self.assertIsInstance(tools, list)
                self.assertLessEqual(len(tools), 16)
                for item in tools:
                    self.assertIsInstance(item, dict)
                    name = item.get("name")
                    self.assertIsInstance(name, str)
                    self.assertRegex(name, tool_name)
                    sentinel = self.bin / name
                    if not sentinel.exists():
                        sentinel.symlink_to(self.bin / "python")
                result = self.invoke(skill, "--json", path=self.bin)
                report = self.report(result)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(report.get("skill"), skill)
                self.assertFalse(report.get("source_checked"))
                self.assertFalse(report.get("runtime_verified"))
                self.assertFalse(report.get("whole_revision_verified"))
                self.assertFalse(report.get("tool_versions_verified"))
                self.assertTrue(any("No source" in str(x) or "no source" in str(x).lower()
                                    for x in report.get("warnings", [])))
                self.assertFalse((self.work / "upstream-ran").exists())

    def test_help_and_default_offline_inventory_without_tools(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        help_result = self.invoke_path(helper, "--help")
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertIn("--json", help_result.stdout)
        self.assertIn("--repo", help_result.stdout)
        result = self.invoke_path(helper, "--json")
        report = self.report(result)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report.get("skill"), package.name)
        self.assertFalse(report.get("source_checked"))
        self.assertTrue(any("No source" in str(x) or "no source" in str(x).lower()
                            for x in report.get("warnings", [])))

    def test_synthetic_source_match_mismatch_missing_root_and_relative_root(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        valid = self.invoke_path(helper, "--json", "--repo", str(self.source))
        self.assertEqual(valid.returncode, 0, valid.stdout + valid.stderr)
        report = self.report(valid)
        self.assertTrue(report.get("source_checked"))
        self.assertTrue(any(c.get("status") == "match" for c in report.get("checks", [])))

        changed = self.source / "README.md"
        original = changed.read_bytes()
        changed.write_bytes(b"tampered\n")
        mismatch = self.invoke_path(helper, "--json", "--repo", str(self.source))
        self.assertEqual(mismatch.returncode, 1, mismatch.stdout + mismatch.stderr)
        self.assertEqual(self.report(mismatch).get("status"), "blocked")
        changed.write_bytes(original)

        missing = self.work / "missing-source"
        missing_result = self.invoke_path(helper, "--json", "--repo", str(missing))
        self.assertEqual(missing_result.returncode, 1, missing_result.stdout + missing_result.stderr)
        (self.source / "README.md").unlink()
        missing_file = self.invoke_path(helper, "--json", "--repo", str(self.source))
        self.assertEqual(missing_file.returncode, 1, missing_file.stdout + missing_file.stderr)

        relative = self.invoke_path(helper, "--json", "--repo", "synthetic-source")
        self.assertEqual(relative.returncode, 2, relative.stdout + relative.stderr)
        traversal = self.invoke_path(helper, "--json", "--repo", str(self.source / ".." / ".."))
        self.assertEqual(traversal.returncode, 2, traversal.stdout + traversal.stderr)

    def test_open_ontologies_helper_supports_default_matching_and_meaningful_mismatch_modes(self):
        package = self.make_package("open-ontologies", self.helper("open-ontologies"))
        helper = package / "scripts" / "preflight.py"

        default = self.invoke_path(helper, "--json")
        self.assertEqual(default.returncode, 0, default.stdout + default.stderr)
        default_report = self.report(default)
        self.assertEqual(default_report.get("skill"), "open-ontologies")
        self.assertFalse(default_report.get("source_checked"))
        self.assertTrue(any("No source" in str(warning) for warning in default_report["warnings"]))

        matching = self.invoke_path(helper, "--json", "--repo", str(self.source))
        self.assertEqual(matching.returncode, 0, matching.stdout + matching.stderr)
        matching_report = self.report(matching)
        self.assertTrue(matching_report.get("source_checked"))
        self.assertEqual(
            {check["status"] for check in matching_report["checks"] if check["name"].startswith("file:")},
            {"match"},
        )

        changed = self.source / "README.md"
        original = changed.read_bytes()
        changed.write_bytes(b"tampered Open Ontologies source\n")
        try:
            mismatch = self.invoke_path(helper, "--json", "--repo", str(self.source))
        finally:
            changed.write_bytes(original)
        self.assertEqual(mismatch.returncode, 1, mismatch.stdout + mismatch.stderr)
        mismatch_report = self.report(mismatch)
        self.assertEqual(mismatch_report.get("status"), "blocked")
        self.assertEqual(
            [check for check in mismatch_report["checks"] if check["name"].startswith("file:")],
            [
                {"name": "file:README.md", "status": "mismatch"},
                {"name": "file:src/module.py", "status": "match"},
            ],
        )
    def test_agent_beacon_standalone_copy_checks_every_manifest_file_and_never_reads_traces(self):
        package = self.make_package("agent-beacon", self.helper("agent-beacon"))
        manifest_path = ROOT / ".agent-skills/agent-beacon/references/source.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["repository"], "Asymptote-Labs/agent-beacon")
        self.assertEqual(manifest["commit"], "cfbd7b1d721664e3b1b5ca2fca5eac4327532c07")
        self.assertTrue(manifest["files"])
        for item in manifest["files"]:
            self.assertEqual(
                item["url"],
                f"https://github.com/{manifest['repository']}/blob/{manifest['commit']}/"
                f"{quote(item['path'], safe='/')}",
            )

        payloads = {
            f"public/{index}.txt": f"beacon fixture {index}\n".encode("utf-8")
            for index, _item in enumerate(manifest["files"])
        }
        self.write_manifest(package, payloads, skill="agent-beacon")
        for path, payload in payloads.items():
            target = self.source / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
        private_trace = self.source / "private-trace.json"
        private_trace.write_text(SECRET, encoding="utf-8")
        before_source = self.snapshot(self.source)

        matching = self.invoke_path(package / "scripts/preflight.py", "--json",
                                     "--repo", str(self.source))
        self.assertEqual(matching.returncode, 0, matching.stdout + matching.stderr)
        matching_report = self.report(matching)
        expected_names = ["file:" + path for path in payloads]
        self.assertEqual(
            [check["name"] for check in matching_report["checks"] if check["name"].startswith("file:")],
            expected_names,
        )
        self.assertEqual(
            [check["status"] for check in matching_report["checks"] if check["name"].startswith("file:")],
            ["match"] * len(expected_names),
        )
        self.assertNotIn(SECRET, matching.stdout + matching.stderr)
        self.assertEqual(self.snapshot(self.source), before_source)

        tampered = next(iter(payloads))
        (self.source / tampered).write_bytes(b"tampered beacon payload\n")
        mismatch = self.invoke_path(package / "scripts/preflight.py", "--json",
                                    "--repo", str(self.source))
        self.assertEqual(mismatch.returncode, 1, mismatch.stdout + mismatch.stderr)
        mismatch_report = self.report(mismatch)
        self.assertEqual(
            [check for check in mismatch_report["checks"] if check["name"].startswith("file:")],
            [{"name": name, "status": "mismatch" if name == "file:" + tampered else "match"}
             for name in expected_names],
        )

        default = self.invoke_path(package / "scripts/preflight.py", "--json")
        self.assertEqual(default.returncode, 0, default.stdout + default.stderr)
        default_report = self.report(default)
        self.assertFalse(default_report["source_checked"])
        self.assertTrue(any("No source" in warning for warning in default_report["warnings"]))
        self.assertNotIn(SECRET, default.stdout + default.stderr)
        unsupported = self.invoke_path(package / "scripts/preflight.py", "--json",
                                        "--expect-commit", SECRET)
        self.assertEqual(unsupported.returncode, 2, unsupported.stdout + unsupported.stderr)
        self.assertNotIn(SECRET, unsupported.stdout + unsupported.stderr)


    def test_all_nineteen_package_copy_is_portable_with_synthetic_manifest(self):
        for skill in SKILLS:
            with self.subTest(skill=skill):
                package = self.make_package(skill, self.helper(skill))
                copied = self.invoke_path(package / "scripts" / "preflight.py", "--json",
                                          "--repo", str(self.source))
                self.assertEqual(copied.returncode, 0, copied.stdout + copied.stderr)
                self.assertEqual(self.report(copied).get("skill"), skill)

    def test_invalid_roots_reject_symlink_root_intermediate_and_marker_leaf(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        real = self.source
        linked_root = self.work / "linked-source"
        linked_root.symlink_to(real, target_is_directory=True)
        parent = self.work / "real-parent"
        parent.mkdir()
        (parent / "tree").mkdir()
        parent_link = self.work / "linked-parent"
        parent_link.symlink_to(parent, target_is_directory=True)
        marker_dir = parent / "tree" / "marker"
        marker_dir.mkdir(parents=True)
        root_marker_link = self.work / "root-marker-link"
        root_marker_link.symlink_to(marker_dir, target_is_directory=True)
        candidates = (linked_root, parent_link / "tree" / "marker")
        for candidate in candidates:
            with self.subTest(candidate=str(candidate)):
                result = self.invoke_path(helper, "--json", "--repo", str(candidate))
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertEqual(self.report(result).get("status"), "error")

        # A symlink at a path component beneath an otherwise trusted root must
        # not let the helper follow it to the marker's bytes.
        nested = self.work / "nested-source"
        nested.mkdir()
        (nested / "README.md").symlink_to(real / "README.md")
        (nested / "src").symlink_to(real / "src", target_is_directory=True)
        self.write_manifest(package, FIXTURE_FILES)
        nested_result = self.invoke_path(helper, "--json", "--repo", str(nested))
        self.assertEqual(nested_result.returncode, 2, nested_result.stdout + nested_result.stderr)
        self.assertFalse((self.work / "upstream-ran").exists())

    def test_unsafe_source_entries_return_two_even_if_a_later_file_mismatches(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        source = self.work / "mixed-unsafe-source"
        source.mkdir()
        (source / "README.md").symlink_to(self.source / "README.md")
        (source / "src").mkdir()
        (source / "src" / "module.py").write_bytes(b"mismatch after unsafe symlink")
        result = self.invoke_path(helper, "--json", "--repo", str(source))
        report = self.report(result)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual(report.get("status"), "error")
        self.assertTrue(any(c.get("status") == "blocked" for c in report.get("checks", [])))
        self.assertTrue(any(c.get("status") == "mismatch" for c in report.get("checks", [])))

    def test_manifest_rejects_raw_fragment_in_blob_url_but_accepts_encoded_path(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        fragment_path = "README.md#fragment"
        manifest = self.write_manifest(package, {fragment_path: b"fragment fixture"})
        result = self.invoke_path(helper, "--json")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.report(result)

        manifest["files"][0]["url"] = (
            f"https://github.com/{manifest['repository']}/blob/{manifest['commit']}/{fragment_path}")
        (package / "references" / "source.json").write_text(json.dumps(manifest), encoding="utf-8")
        raw = self.invoke_path(helper, "--json")
        self.assertEqual(raw.returncode, 2, raw.stdout + raw.stderr)
        self.assertEqual(self.report(raw).get("status"), "error")

    def test_parser_disables_long_option_abbreviations(self):
        package = self.make_package()
        result = self.invoke_path(package / "scripts" / "preflight.py", "--json", "--j")
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.report(result)
        self.assertNotIn("Traceback", result.stderr)

    def test_public_paths_reject_traversal_and_sensitive_locations(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        invalid = (
            "../secret", "a/../secret", "/absolute/path", "./README.md", ".",
            "a//b", "a\\b", "README\n.md", ".env", ".env.local", ".ssh/key",
            ".aws/credentials", ".config/token", "secrets/key", "credentials.json",
            "secret.json", "tokens.txt", ".netrc",
            "private.pem", "client.key", "bundle.p12", "archive.pfx",
        )
        for value in invalid:
            with self.subTest(path=value):
                self.write_manifest(package, {value: b"x"})
                result = self.invoke_path(helper, "--json", "--repo", str(self.source))
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertEqual(self.report(result).get("status"), "error")
                self.assertNotIn(value, result.stdout + result.stderr)
        # Restore a valid manifest for subsequent package checks.
        self.write_manifest(package)

    def test_malformed_duplicate_oversized_manifests_invalid_pin_url_and_tool_are_rejected(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        manifest_path = package / "references" / "source.json"
        cases = (
            b"{broken",
            b'{"schema_version":1,"schema_version":1}',
            b" " * (128 * 1024 + 1),
        )
        for data in cases:
            with self.subTest(kind="manifest", size=len(data)):
                manifest_path.write_bytes(data)
                result = self.invoke_path(helper, "--json")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(self.report(result).get("status"), {"error", "blocked"})

        valid = self.write_manifest(package)
        bad_manifests = []
        for mutation in (
            {"commit": "not-a-full-sha"},
            {"repository": "https://example.invalid/source"},
            {"tools": [{"name": "../python"}]},
            {"files": [{"path": "README.md", "sha256": "a" * 64,
                        "url": "https://evil.invalid/README.md"}]},
        ):
            altered = dict(valid)
            altered.update(mutation)
            bad_manifests.append(altered)
        for manifest in bad_manifests:
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            result = self.invoke_path(helper, "--json")
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertEqual(self.report(result).get("status"), "error")

    def test_oversized_and_nonregular_source_files_fail_nonblocking(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        large = self.work / "large-source"
        large.mkdir()
        (large / "README.md").write_bytes(b"x" * (8 * 1024 * 1024 + 1))
        (large / "src").mkdir()
        (large / "src" / "module.py").write_bytes(FIXTURE_FILES["src/module.py"])
        result = self.invoke_path(helper, "--json", "--repo", str(large), timeout=8)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)

        if hasattr(os, "mkfifo"):
            fifo = self.work / "fifo-source"
            fifo.mkdir()
            os.mkfifo(fifo / "README.md")
            (fifo / "src").mkdir()
            (fifo / "src" / "module.py").write_bytes(FIXTURE_FILES["src/module.py"])
            before = self.snapshot(fifo)
            result = self.invoke_path(helper, "--json", "--repo", str(fifo), timeout=3)
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertEqual(self.snapshot(fifo), before)

        if hasattr(os, "geteuid") and os.geteuid() != 0:
            unreadable = self.work / "unreadable-source"
            unreadable.mkdir()
            denied = unreadable / "README.md"
            denied.write_bytes(FIXTURE_FILES["README.md"])
            denied.chmod(0)
            (unreadable / "src").mkdir()
            (unreadable / "src" / "module.py").write_bytes(FIXTURE_FILES["src/module.py"])
            try:
                result = self.invoke_path(helper, "--json", "--repo", str(unreadable), timeout=3)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            finally:
                denied.chmod(0o600)

    def test_tool_discovery_is_path_only_and_never_runs_dangerous_sentinels(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        before = self.snapshot(self.work)
        result = self.invoke_path(helper, "--json", path=self.bin)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = self.report(result)
        self.assertTrue(any(c.get("name") == "tool:python3" for c in report.get("checks", [])))
        self.assertFalse((self.work / "upstream-ran").exists())
        self.assertFalse((self.work / "git-config-sentinel").exists())
        self.assertEqual(self.snapshot(self.work), before)

    def test_hostile_git_selectors_and_trace_values_are_ignored(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        env = self.env(path=self.bin)
        result = self.invoke_path(helper, "--json", "--repo", str(self.source), env=env)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.report(result)
        for name in ("git-trace-secret-path", "git-setup-secret-path", "git-packet-secret-path"):
            self.assertFalse((self.home / name).exists(), name)
        self.assertFalse((self.work / "git-config-sentinel").exists())
        self.assertFalse((self.work / "upstream-ran").exists())

    def test_invalid_input_output_never_discloses_private_paths_or_secrets(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        private = str(self.home / "private-user-secret-path")
        cases = (
            ("--json", "--repo", "relative-" + private),
            ("--json", "--expect-commit", SECRET),
            ("--json", "--unknown-option", SECRET),
        )
        for args in cases:
            with self.subTest(args=args):
                result = self.invoke_path(helper, *args)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.report(result)
                self.assertNotIn(private, result.stdout + result.stderr)
                self.assertNotIn(SECRET, result.stdout + result.stderr)

    def test_preflight_does_not_write_to_source_or_standalone_package(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        before_package = self.snapshot(package)
        before_source = self.snapshot(self.source)
        result = self.invoke_path(helper, "--json", "--repo", str(self.source))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.snapshot(package), before_package)
        self.assertEqual(self.snapshot(self.source), before_source)
        self.assertFalse((package / "__pycache__").exists())

    def test_closed_stdout_pipe_exits_two_without_traceback_or_private_path(self):
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        private = str(self.home / "private-secret-path")
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            process = subprocess.Popen(
                [sys.executable, "-B", str(helper), "--json", "--repo", private],
                cwd=self.work, env=self.env(), stdout=write_fd,
                stderr=subprocess.PIPE, text=True, close_fds=True,
            )
        finally:
            os.close(write_fd)
        _, stderr = process.communicate(timeout=8)
        self.assertEqual(process.returncode, 2, stderr)
        self.assertNotIn("Traceback", stderr)
        self.assertNotIn(private, stderr)
        self.assertNotIn(SECRET, stderr)

    def test_nested_public_file_reads_do_not_accumulate_descriptors_when_supported(self):
        if not Path("/dev/fd").is_dir():
            self.skipTest("descriptor enumeration is not available on this platform")
        package = self.make_package()
        helper = package / "scripts" / "preflight.py"
        probe = (
            "import os, runpy, sys; "
            "ns=runpy.run_path(sys.argv[1]); fd=ns['directory_fd'](sys.argv[2]); "
            "before=len(os.listdir('/dev/fd')); "
            "[ns['read_public'](fd, ('src','module.py'), ns['MAX_BYTES']) for _ in range(100)]; "
            "after=len(os.listdir('/dev/fd')); os.close(fd); "
            "print(before, after); raise SystemExit(0 if before == after else 1)"
        )
        result = subprocess.run(
            [sys.executable, "-B", "-c", probe, str(helper), str(self.source)],
            cwd=self.work, env=self.env(), text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
