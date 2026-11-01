#!/usr/bin/env python3
"""Offline package contracts, NOT executed model evals or game-runtime proof.

Run: python3 -B scripts/test_game_source_skills.py -v
No catalog/manifest projection is required. Missing parallel-authored packages
produce a PENDING completeness failure and explicit skips, never a green result.
Only temporary COPIES get synthetic source manifests; real source checkouts,
HOME, engines, installers, network and upstream code are never used.
"""
from __future__ import annotations

from datetime import date
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / ".agent-skills"
REFERENCE = SKILLS / "awesome-gamedev-agent-skills/scripts/preflight.py"
EXPECTED = (
    "jolt-physics", "terrain3d", "material-maker", "effekseer",
    "godot-voxel-tools", "recast-navigation", "ozz-animation", "the-forge",
    "meshoptimizer", "fastnoise2",
)
REQUIRED = ("SKILL.md", "references/upstream.md", "references/source.json",
            "scripts/preflight.py", "evals/evals.json")
LINK = re.compile(r"\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)")
REFERENCE_LINK = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?", re.M)
SCALAR = re.compile(r"^( *)([\w-]+):[ \t]*(.*)$", re.M)
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
REPO = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+\Z")


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def metadata(package):
    text = (package / "SKILL.md").read_text(encoding="utf-8")
    assert text.startswith("---\n"), "missing YAML frontmatter"
    header, separator, _ = text[4:].partition("\n---\n")
    assert separator, "unterminated YAML frontmatter"
    # Compare only scalar identity fields, not a pretend general YAML parser.
    rows = SCALAR.findall(header)
    top = {key: value.strip().strip("\"'") for indent, key, value in rows if not indent}
    meta = {key: value.strip().strip("\"'") for indent, key, value in rows if indent}
    description = re.search(r"^description:\s*(.*?)(?=^\S|\Z)", header, re.M | re.S)
    scope = " ".join(description.group(1).strip().lstrip(">|-").split()) if description else ""
    return top, meta, scope


def ready(name):
    package = SKILLS / name
    missing = [rel for rel in REQUIRED if not (package / rel).is_file()]
    if missing:
        raise unittest.SkipTest(f"PENDING {name}: missing {', '.join(missing)}")
    return package


def source_prefix(data):
    host = data.get("host", "github.com")
    assert host == ("codeberg.org" if data["skill"] == "the-forge" else "github.com")
    route = "src/commit" if host == "codeberg.org" else "blob"
    return f'https://{host}/{data["repository"]}/{route}/{data["commit"]}/'


def local_path(value):
    assert isinstance(value, str) and value and "\\" not in value
    path = PurePosixPath(value)
    assert not path.is_absolute() and path.parts and ".." not in path.parts
    assert str(path) == value and path.parts[0] not in (".", "..")
    return path


# Preload script imports before installing an audit hook, then execute only the
# copied helper. Deny external processes, sockets, writes and outside-file reads.
GUARD = r'''
import __future__, argparse, errno, hashlib, json, os, pathlib, re, shutil, stat, sys
from urllib.parse import quote
script, boundary, *args = sys.argv[1:]
code = compile(pathlib.Path(script).read_bytes(), script, 'exec')
argparse.ArgumentParser(description='preload stdlib localization', allow_abbrev=False)
base = pathlib.Path(boundary)
def guard(event, args):
    if event.startswith('socket.') or event in ('subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.exec'):
        raise RuntimeError('external operation forbidden: ' + event)
    if event == 'open':
        target, mode, flags = args
        if isinstance(target, int):
            return
        p = pathlib.Path(os.fsdecode(target))
        if (mode and any(c in mode for c in 'wax+')) or flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND):
            raise RuntimeError('helper write forbidden')
        if '..' in p.parts or (p.is_absolute() and not p.is_relative_to(base) and p not in base.parents):
            raise RuntimeError('outside fixture read forbidden')
    if event in ('os.listdir', 'os.scandir'):
        p = pathlib.Path(os.fsdecode(args[0]))
        if not p.is_absolute() or not p.is_relative_to(base):
            raise RuntimeError('outside fixture discovery forbidden')
sys.addaudithook(guard)
sys.argv = [script, *args]
exec(code, {'__name__': '__main__', '__file__': script})
'''


class InventoryTests(unittest.TestCase):
    def test_all_ten_packages_complete(self):
        missing = [f"{name}/{rel}" for name in EXPECTED for rel in REQUIRED
                   if not (SKILLS / name / rel).is_file()]
        self.assertFalse(missing, "PENDING parallel package authorship:\n" + "\n".join(missing))

    def test_ten_distinct_source_scopes(self):
        packages = [ready(name) for name in EXPECTED]
        self.assertEqual(len(EXPECTED), 10)
        self.assertEqual(len({load(p / "references/source.json")["repository"].lower()
                              for p in packages}), 10)
        scopes = [metadata(p)[2].casefold() for p in packages]
        self.assertTrue(all(scopes), "each source operator needs a nonempty scope")
        self.assertEqual(len(set(scopes)), 10, "source operators must not share a generic description")


class PackageContract:
    """Mixed into one TestCase per expected name, so pending skips stay visible."""
    name = ""

    def setUp(self):
        self.package = ready(self.name)

    def test_metadata_and_selected_source_schema(self):
        top, meta, scope = metadata(self.package)
        data = load(self.package / "references/source.json")
        evidence = (self.package / "references/upstream.md").read_text(encoding="utf-8")
        body = (self.package / "SKILL.md").read_text(encoding="utf-8")
        self.assertEqual(top["name"], self.name)
        self.assertTrue(scope)
        self.assertTrue(meta["version"])
        self.assertEqual(type(data["schema_version"]), int)
        self.assertEqual(data["schema_version"], 1)
        self.assertEqual(data["skill"], self.name)
        self.assertRegex(data["repository"], REPO)
        self.assertNotIn(data["repository"].split("/")[1], (".", ".."))
        self.assertRegex(data["commit"], HEX40)
        self.assertEqual(meta["upstream_commit"], data["commit"])
        host = data.get("host", "github.com")
        self.assertIn(meta["source"], (data["repository"], f'https://{host}/{data["repository"]}'))
        date.fromisoformat(data["observed_at"][:10])
        for text in (evidence, body):
            self.assertIn(data["repository"], text)
            self.assertIn(data["commit"], text)
        license_info = data["license"]
        self.assertTrue(license_info["conclusion"].strip())
        local_path(license_info["path"])
        prefix = source_prefix(data)
        self.assertEqual(license_info["url"], prefix + quote(license_info["path"], safe="/"))
        self.assertIn(license_info["url"], evidence)
        files = data["files"]
        self.assertIsInstance(files, list)
        self.assertTrue(1 <= len(files) <= 12)
        self.assertEqual(len({item["path"] for item in files}), len(files))
        self.assertIn(license_info["path"], {item["path"] for item in files})
        for item in files:
            local_path(item["path"])
            self.assertRegex(item["sha256"], HEX64)
            self.assertEqual(item["url"], prefix + quote(item["path"], safe="/"))
            self.assertTrue(item["purpose"].strip())
        self.assertIsInstance(data["tools"], list)
        self.assertLessEqual(len(data["tools"]), 16)
        for tool in data["tools"]:
            self.assertRegex(tool["name"], r"^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$")
            self.assertTrue(tool["purpose"].strip())
        if self.name != "the-forge":
            self.assertEqual((self.package / "scripts/preflight.py").read_bytes(), REFERENCE.read_bytes())
        # The Forge's approved Codeberg URL adapter is tested behaviorally below.

    def test_standalone_markdown_support_links(self):
        with tempfile.TemporaryDirectory(prefix="game-skill-links-") as tmp:
            copied = Path(tmp).resolve() / self.name
            shutil.copytree(self.package, copied, symlinks=True)
            links = set(LINK.findall((copied / "SKILL.md").read_text(encoding="utf-8")))
            self.assertIn("references/upstream.md", links)
            self.assertIn("references/source.json", links)
            for document in copied.rglob("*"):
                self.assertFalse(document.is_symlink(), f"package symlink: {document.relative_to(copied)}")
                if document.suffix != ".md" or not document.is_file():
                    continue
                text = document.read_text(encoding="utf-8")
                for target in LINK.findall(text) + REFERENCE_LINK.findall(text):
                    url = urlsplit(target)
                    if url.scheme or url.netloc or not url.path:
                        continue
                    self.assertFalse(url.path.startswith("/"), f"absolute support: {target}")
                    resolved = (document.parent / unquote(url.path)).resolve()
                    self.assertTrue(resolved.is_relative_to(copied), f"support escapes package: {target}")
                    self.assertTrue(resolved.is_file(), f"missing standalone support: {target}")

    def test_authored_not_executed_eval_routes_and_approval(self):
        data = load(self.package / "evals/evals.json")
        self.assertIsInstance(data, dict)
        self.assertEqual(data["skill_name"], self.name)
        cases = data["evals"]
        self.assertGreaterEqual(len(cases), 3)
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        self.assertEqual(len({case["prompt"] for case in cases}), len(cases))
        self.assertFalse({"pass_rate", "score", "results"} & data.keys())
        evidence = []
        for case in cases:
            self.assertTrue(case["prompt"].strip())
            behavior = case.get("expected_behavior", case.get("expected_output"))
            if isinstance(behavior, list):
                self.assertTrue(behavior)
                self.assertTrue(all(isinstance(v, str) and v.strip() for v in behavior))
                behavior = " ".join(behavior)
            self.assertIsInstance(behavior, str)
            self.assertTrue(behavior.strip())
            self.assertIs(case.get("authored", data.get("authored")), True)
            self.assertIs(case.get("executed", data.get("executed")), False)
            self.assertEqual(case.get("evidence_status", data.get("evidence_status")), "authored-not-executed")
            self.assertFalse({"pass_rate", "score", "results"} & case.keys())
            evidence.append((case, (str(case["id"]) + " " + case["prompt"] + " " + behavior).lower()))
        self.assertTrue(any(case.get("expected_skill") == self.name for case, _ in evidence), "missing in-scope routing case")
        self.assertTrue(any(re.search(r"near[-_ ]?miss|out.of.scope|route (?:away|to)|generic", text)
                            and case.get("expected_skill") not in (None, self.name)
                            for case, text in evidence), "missing alternative-owner near-miss case")
        self.assertTrue(any(re.search(r"approv|consent|permission", text)
                            and re.search(r"before|separate|explicit|stop|require", text)
                            for _, text in evidence), "missing side-effect approval case")

    def test_preflight_platform_boundary_is_documented(self):
        body = (self.package / "SKILL.md").read_text(encoding="utf-8")
        for marker in ("O_NOFOLLOW", "dir_fd", "secure_posix_traversal_unavailable", "WSL"):
            self.assertIn(marker, body, f"missing offline helper platform boundary: {marker}")

    def test_offline_preflight_in_copied_synthetic_fixture(self):
        if not hasattr(os, "O_NOFOLLOW") or os.open not in os.supports_dir_fd:
            self.skipTest("secure POSIX traversal unavailable; no runtime claim")
        with tempfile.TemporaryDirectory(prefix="game-source-preflight-") as tmp:
            # Resolve only the owned temp base (macOS /var alias), not attacker paths.
            work = Path(tmp).resolve()
            copied = work / "skill" / self.name
            shutil.copytree(self.package, copied, symlinks=True)
            self.assertEqual((copied / "scripts/preflight.py").read_bytes(),
                             (self.package / "scripts/preflight.py").read_bytes())
            home = work / "empty-home"
            home.mkdir()
            source = work / "synthetic-source"
            source.mkdir()
            payload = b"synthetic public fixture; never upstream code\n"
            # Forge intentionally restricts its audited inventory to these two
            # root files. Change only hashes in its COPIED test manifest, not
            # the helper's path allowlist. Other operators retain nested reads.
            selected = (["README.md", "LICENSE.txt"] if self.name == "the-forge"
                        else ["README.md", "docs/guide.md"])
            if self.name != "the-forge":
                (source / "docs").mkdir()
            for rel in selected:
                (source / rel).write_bytes(payload)
            original_manifest = (copied / "references/source.json").read_bytes()
            manifest = json.loads(original_manifest)
            manifest["tools"] = [{"name": "never-run-game-test-tool", "purpose": "inventory only"}]
            prefix = source_prefix(manifest)
            manifest["files"] = [{"path": rel, "sha256": hashlib.sha256(payload).hexdigest(),
                                  "url": prefix + quote(rel, safe="/"), "purpose": "test-only fixture"}
                                 for rel in selected]
            manifest_path = copied / "references/source.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            script = copied / "scripts/preflight.py"

            def state():
                return {str(p.relative_to(work)): ("link", os.readlink(p)) if p.is_symlink()
                        else ("file", hashlib.sha256(p.read_bytes()).hexdigest()) if p.is_file()
                        else ("dir", "") for p in work.rglob("*")}

            def run(repo=None, code=0, checked=False, statuses=None, error=None):
                before = state()
                args = [sys.executable, "-B", "-c", GUARD, str(script), str(work), "--json"]
                if repo is not None:
                    args += ["--repo", str(repo)]
                result = subprocess.run(args, cwd=work, env={"HOME": str(home), "PATH": "", "LC_ALL": "C", "LANG": "C",
                    "TMPDIR": str(work), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1",
                    "PYTHONHOME": sys.base_prefix},
                    text=True, capture_output=True, timeout=10, check=False)
                self.assertEqual(result.returncode, code, result.stdout + result.stderr)
                self.assertEqual(result.stderr, "")
                report = json.loads(result.stdout)
                self.assertEqual(report["status"], {0: "ok", 1: "blocked", 2: "error"}[code])
                self.assertIs(report["source_checked"], checked)
                for key in ("runtime_verified", "whole_revision_verified", "tool_versions_verified"):
                    self.assertIs(report[key], False)
                self.assertEqual(report["scope"], "offline-selected-files")
                self.assertNotIn(str(work), result.stdout, "local path leaked")
                self.assertNotIn(payload.decode().strip(), result.stdout, "source contents leaked")
                files = {r["name"]: r["status"] for r in report["checks"] if r["name"].startswith("file:")}
                if statuses is not None:
                    self.assertEqual(files, dict(zip(("file:" + x for x in selected), statuses)))
                if error:
                    self.assertIn(error, {r.get("code") for r in report["checks"]})
                self.assertEqual(state(), before, "helper modified its fixture")
                self.assertEqual(list(home.iterdir()), [])

            synthetic_manifest = manifest_path.read_bytes()
            manifest_path.write_bytes(original_manifest)
            run(statuses=[])  # Actual package inventory, still no upstream reads.
            manifest_path.write_bytes(synthetic_manifest)
            run(statuses=[])
            run(source, checked=True, statuses=["match", "match"])
            (source / "README.md").write_bytes(b"deliberate mismatch\n")
            run(source, code=1, checked=True, statuses=["mismatch", "match"])
            (source / "README.md").unlink()
            run(source, code=1, checked=True, statuses=["blocked", "match"], error="public_file_missing")
            (source / "README.md").write_bytes(payload)
            run(work / "missing-source", code=1, error="source_root_missing")
            # Both leaf and directory links point at harmless fixture data only.
            target = work / "public-target"
            target.write_bytes(payload)
            (source / "README.md").unlink()
            (source / "README.md").symlink_to(target)
            run(source, code=2, checked=True, statuses=["blocked", "match"], error="public_file_unsafe_or_unreadable")
            (source / "README.md").unlink()
            (source / "README.md").write_bytes(payload)
            if self.name == "the-forge":
                # An allowed filename pointing to a directory must not bypass
                # O_NOFOLLOW either; root/ancestor directory links follow below.
                directory_target = work / "public-directory"
                directory_target.mkdir()
                (source / "LICENSE.txt").unlink()
                (source / "LICENSE.txt").symlink_to(directory_target, target_is_directory=True)
                run(source, code=2, checked=True, statuses=["match", "blocked"], error="public_file_unsafe_or_unreadable")
                (source / "LICENSE.txt").unlink()
                (source / "LICENSE.txt").write_bytes(payload)
            else:
                (source / "docs").rename(source / "real-docs")
                (source / "docs").symlink_to(source / "real-docs", target_is_directory=True)
                run(source, code=2, checked=True, statuses=["match", "blocked"], error="public_file_unsafe_or_unreadable")
            root_link = work / "source-link"
            root_link.symlink_to(source, target_is_directory=True)
            run(root_link, code=2, error="source_root_unsafe_or_unreadable")
            parent_link = work / "parent-link"
            parent_link.symlink_to(work, target_is_directory=True)
            run(parent_link / source.name, code=2, error="source_root_unsafe_or_unreadable")
            if self.name == "the-forge":
                # Keep lexical parent traversal unnormalized: resolving it here
                # would conceal the invalid input from the actual helper.
                run(source / ".." / source.name, code=2, error="absolute_nonsymlink_root_required")
                # Negative manifest cases are deliberately NOT valid inventory.
                # Even an existing harmless target must be rejected before read.
                (work / "PUBLIC.txt").write_bytes(payload)
                (source / ".env").write_bytes(payload)
                for path, error in (
                    ("nested/PUBLIC.txt", "unexpected_source_path"),
                    ("../PUBLIC.txt", "invalid_public_path"),
                    (".env", "sensitive_path_not_allowed"),
                    (".ssh/config", "sensitive_path_not_allowed"),
                    ("credentials.json", "sensitive_path_not_allowed"),
                    ("nested/secret.txt", "sensitive_path_not_allowed"),
                ):
                    with self.subTest(rejected_manifest_path=path):
                        changed = json.loads(synthetic_manifest)
                        changed["files"][0]["path"] = path
                        changed["files"][0]["url"] = prefix + quote(path, safe="/")
                        manifest_path.write_text(json.dumps(changed), encoding="utf-8")
                        try:
                            run(source, code=2, checked=False, statuses=[], error=error)
                        finally:
                            manifest_path.write_bytes(synthetic_manifest)
                run(source, checked=True, statuses=["match", "match"])
            # Manifest leaf and parent-directory links must be blocked too.
            saved = copied / "manifest-fixture.json"
            manifest_path.rename(saved)
            manifest_path.symlink_to(saved)
            run(code=2, error="public_file_unsafe_or_unreadable")
            manifest_path.unlink()
            saved.rename(manifest_path)
            refs = copied / "references"
            refs.rename(copied / "real-references")
            refs.symlink_to(copied / "real-references", target_is_directory=True)
            run(code=2, error="public_file_unsafe_or_unreadable")


for _name in EXPECTED:
    _class = "Test_" + _name.replace("-", "_")
    globals()[_class] = type(_class, (PackageContract, unittest.TestCase), {"name": _name, "__module__": __name__})

if __name__ == "__main__":
    unittest.main()
