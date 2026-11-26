#!/usr/bin/env python3
"""Offline packaging, provenance, and preflight contract tests for the 13 coding-agent ecosystem skills."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml


ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = ROOT / ".agent-skills"
REFERENCE_PREFLIGHT = SKILLS_ROOT / "donchitos-game-studios/scripts/preflight.py"

NEW_SKILLS = [
    ("thedotmack-mem", "thedotmack/claude-mem"),
    ("beads", "gastownhall/beads"),
    ("serena", "oraios/serena"),
    ("chrome-devtools-mcp", "ChromeDevTools/chrome-devtools-mcp"),
    ("superpowers", "obra/superpowers"),
    ("gstack", "garrytan/gstack"),
    ("official-agent-skills", "anthropics/skills"),
    ("orca", "stablyai/orca"),
    ("wshobson-agents", "wshobson/agents"),
    ("happy", "slopus/happy"),
    ("cc-switch", "farion1231/cc-switch"),
    ("jarrodwatts-hud", "jarrodwatts/claude-hud"),
    ("ccusage", "ccusage/ccusage"),
]

EXISTING_ECOSYSTEM_SKILLS = [
    "rtk",
    "context-mode",
    "graphify",
    "context7",
    "spec-kit",
    "ruflo",
]

HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    assert text.startswith("---\n"), "SKILL.md must start with YAML frontmatter"
    _, fm_raw, body = text.split("---", 2)
    return yaml.safe_load(fm_raw), body


class CodingAgentEcosystemCatalogTest(unittest.TestCase):
    def test_bundle_and_exclusion_in_catalog_and_docs(self):
        manifest = json.loads((SKILLS_ROOT / "skills.json").read_text(encoding="utf-8"))
        bundle = manifest["bundles"]["coding-agent-ecosystem"]
        expected = [name for name, _ in NEW_SKILLS] + EXISTING_ECOSYSTEM_SKILLS
        self.assertIsInstance(bundle, list)
        self.assertEqual(set(bundle), set(expected))
        self.assertEqual(len(bundle), 19)
        self.assertNotIn("oh-my-claudecode", bundle)
        skill_names = {s["name"] for s in manifest["skills"]}
        self.assertNotIn("oh-my-claudecode", skill_names)
        for name, _ in NEW_SKILLS:
            self.assertIn(name, skill_names)
            self.assertNotIn("claude", name)
            self.assertNotIn("anthropic", name)

        for doc_rel in ("README.md", "README.ko.md", "README.es-ES.md", "setup-all-skills-prompt.md", "docs/attribution.md"):
            content = (ROOT / doc_rel).read_text(encoding="utf-8")
            self.assertIn("coding-agent-ecosystem", content, doc_rel)
            for name, repo in NEW_SKILLS:
                self.assertIn(name, content, f"{doc_rel} missing {name}")
                if doc_rel in ("setup-all-skills-prompt.md", "docs/attribution.md"):
                    self.assertIn(repo, content, f"{doc_rel} missing {repo}")


class CodingAgentEcosystemSkillContractTest(unittest.TestCase):
    def _iter_skills(self):
        for name, repo in NEW_SKILLS:
            yield name, repo, SKILLS_ROOT / name

    def test_frontmatter_toon_provenance_and_links(self):
        manifest = json.loads((SKILLS_ROOT / "skills.json").read_text(encoding="utf-8"))
        by_name = {s["name"]: s for s in manifest["skills"]}
        ref_bytes = REFERENCE_PREFLIGHT.read_bytes()

        for name, repo, pkg in self._iter_skills():
            with self.subTest(skill=name):
                self.assertTrue((pkg / "SKILL.md").is_file())
                self.assertTrue((pkg / "SKILL.toon").is_file())
                self.assertTrue((pkg / "references/upstream.md").is_file())
                self.assertTrue((pkg / "references/source.json").is_file())
                self.assertTrue((pkg / "scripts/preflight.py").is_file())
                self.assertTrue((pkg / "evals/evals.json").is_file())
                self.assertEqual((pkg / "scripts/preflight.py").read_bytes(), ref_bytes)

                fm, body = parse_frontmatter((pkg / "SKILL.md").read_text(encoding="utf-8"))
                self.assertEqual(fm["name"], name)
                desc = " ".join(str(fm["description"]).split())
                self.assertEqual(desc, by_name[name]["description"])
                meta = fm["metadata"]
                self.assertEqual(meta["source"], f"https://github.com/{repo}")
                self.assertRegex(meta["upstream_commit"], HEX40)

                toon = (pkg / "SKILL.toon").read_text(encoding="utf-8")
                self.assertTrue(toon.startswith(f"N:{name}\n"))

                src = json.loads((pkg / "references/source.json").read_text(encoding="utf-8"))
                self.assertEqual(src["schema_version"], 1)
                self.assertEqual(src["skill"], name)
                self.assertEqual(src["repository"], repo)
                self.assertEqual(src["commit"], meta["upstream_commit"])
                self.assertGreaterEqual(len(src["files"]), 3)
                for fobj in src["files"]:
                    self.assertRegex(fobj["sha256"], HEX64)
                    self.assertEqual(
                        fobj["url"],
                        f"https://github.com/{repo}/blob/{src['commit']}/{fobj['path']}",
                    )
                self.assertGreaterEqual(len(src["tools"]), 1)
                for tool in src["tools"]:
                    self.assertIsInstance(tool, dict)
                    self.assertRegex(tool["name"], r"^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$")

                upstream = (pkg / "references/upstream.md").read_text(encoding="utf-8")
                self.assertIn(repo, upstream)
                self.assertIn(src["commit"], upstream)

                for doc in pkg.rglob("*"):
                    self.assertFalse(doc.is_symlink(), f"symlink found: {doc}")
                    if doc.suffix != ".md" or not doc.is_file():
                        continue
                    for target in LINK_RE.findall(doc.read_text(encoding="utf-8")):
                        parsed = urlsplit(target)
                        if parsed.scheme or parsed.netloc or not parsed.path:
                            continue
                        self.assertFalse(parsed.path.startswith("/"), target)
                        resolved = (doc.parent / unquote(parsed.path)).resolve()
                        self.assertTrue(resolved.is_relative_to(pkg.resolve()), target)
                        self.assertTrue(resolved.is_file(), f"broken link {target} in {doc}")

                ev = json.loads((pkg / "evals/evals.json").read_text(encoding="utf-8"))
                self.assertEqual(ev["skill_name"], name)
                self.assertIs(ev["authored"], True)
                self.assertIs(ev["executed"], False)
                self.assertEqual(ev["evidence_status"], "authored-not-executed")
                self.assertGreaterEqual(len(ev["evals"]), 3)
                self.assertTrue(any(c["expected_skill"] == name for c in ev["evals"]))
                self.assertTrue(any(c["expected_skill"] != name for c in ev["evals"]))

    def test_preflight_runs_offline_and_rejects_tampered_digest(self):
        for name, _, pkg in self._iter_skills():
            with self.subTest(skill=name):
                res = subprocess.run(
                    [sys.executable, str(pkg / "scripts/preflight.py"), "--json"],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                payload = json.loads(res.stdout)
                self.assertEqual(payload["status"], "ok")
                self.assertEqual(payload["skill"], name)
                self.assertEqual(payload["scope"], "offline-selected-files")
                self.assertIs(payload["runtime_verified"], False)
                self.assertIs(payload["source_checked"], False)

                if name == "beads":
                    with tempfile.TemporaryDirectory(prefix="eco-preflight-") as tmp:
                        work = Path(tmp).resolve()
                        copied = work / name
                        shutil.copytree(pkg, copied)
                        repo_dir = work / "synth-repo"
                        repo_dir.mkdir()
                        src_file = copied / "references/source.json"
                        src_data = json.loads(src_file.read_text(encoding="utf-8"))
                        for item in src_data["files"]:
                            fpath = repo_dir / item["path"]
                            fpath.parent.mkdir(parents=True, exist_ok=True)
                            data = f"fixture {item['path']}\n".encode()
                            fpath.write_bytes(data)
                            item["sha256"] = hashlib.sha256(data).hexdigest()
                        src_file.write_text(json.dumps(src_data, indent=2), encoding="utf-8")
                        ok = subprocess.run(
                            [sys.executable, str(copied / "scripts/preflight.py"), "--repo", str(repo_dir), "--json"],
                            capture_output=True,
                            text=True,
                            check=True,
                        )
                        ok_payload = json.loads(ok.stdout)
                        self.assertEqual(ok_payload["status"], "ok")
                        self.assertIs(ok_payload["source_checked"], True)
                        # Tamper one file and assert preflight fails closed
                        first_path = repo_dir / src_data["files"][0]["path"]
                        first_path.write_bytes(b"tampered\n")
                        bad = subprocess.run(
                            [sys.executable, str(copied / "scripts/preflight.py"), "--repo", str(repo_dir), "--json"],
                            capture_output=True,
                            text=True,
                        )
                        self.assertEqual(bad.returncode, 1)
                        self.assertEqual(json.loads(bad.stdout)["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
