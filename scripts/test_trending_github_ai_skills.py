#!/usr/bin/env python3
"""Offline packaging, provenance, and preflight contract tests for the 10 trending GitHub AI skills."""
import hashlib
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILLS_ROOT = ROOT / ".agent-skills"
REFERENCE_PREFLIGHT = SKILLS_ROOT / "beads" / "scripts" / "preflight.py"

NEW_SKILLS = [
    ("opengame", "nexu-io/opengame"),
    ("llm-asm", "alesha-pro/llm.asm"),
    ("safe-anything", "erkamyaman/safe-anything"),
    ("inkworks", "Moh4696/inkworks-skill"),
    ("waifu2x-vulkan", "Red2076-arch/waifu2x-image-upscaler-windows"),
    ("pequalnp-proofs", "open-goat/pequalnp-proofs"),
    ("freellm-router", "jaredfreellm/FREELLM_INSTALL"),
    ("garimpo", "matheusmongarde/garimpo"),
    ("h3-creator-studio", "animede/h3-creator-studio"),
    ("rollerskate-robot", "AI-FanGe/A-MicroRobot-that-can-Rollerskate"),
]

HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")

def parse_frontmatter(text: str) -> tuple[dict, str]:
    assert text.startswith("---\n"), "SKILL.md must start with YAML frontmatter"
    _, fm_raw, body = text.split("---", 2)
    return yaml.safe_load(fm_raw), body

class TrendingGitHubAiSkillsTest(unittest.TestCase):
    def test_bundle_and_catalog_metadata(self):
        manifest = json.loads((SKILLS_ROOT / "skills.json").read_text(encoding="utf-8"))
        bundle = manifest["bundles"]["trending-github-ai"]
        expected_names = [name for name, _ in NEW_SKILLS]
        self.assertEqual(bundle, expected_names)

        skills_by_name = {s["name"]: s for s in manifest["skills"]}
        for name, _ in NEW_SKILLS:
            self.assertIn(name, skills_by_name)
            entry = skills_by_name[name]
            cat = entry["category"]
            sub = entry["subcategory"]
            self.assertIn(name, manifest["categories"][cat])
            self.assertIn(name, manifest["subcategories"][cat][sub])

    def test_skill_files_and_contract(self):
        manifest = json.loads((SKILLS_ROOT / "skills.json").read_text(encoding="utf-8"))
        by_name = {s["name"]: s for s in manifest["skills"]}
        ref_bytes = REFERENCE_PREFLIGHT.read_bytes()

        for name, repo in NEW_SKILLS:
            pkg = SKILLS_ROOT / name
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
                self.assertGreaterEqual(len(src["files"]), 2)
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

                ev = json.loads((pkg / "evals/evals.json").read_text(encoding="utf-8"))
                self.assertEqual(ev["skill_name"], name)
                self.assertTrue(ev["authored"])
                self.assertFalse(ev["executed"])
                self.assertGreaterEqual(len(ev["evals"]), 2)
                self.assertTrue(any(c["expected_skill"] == name for c in ev["evals"]))
                self.assertTrue(any(c["expected_skill"] != name for c in ev["evals"]))

                # Execute preflight check
                res = subprocess.run(
                    [sys.executable, str(pkg / "scripts/preflight.py"), "--json"],
                    capture_output=True,
                    text=True,
                    cwd=str(pkg),
                )
                self.assertEqual(res.returncode, 0, f"preflight failed for {name}: {res.stderr}")

    def test_docs_and_setup_synchronization(self):
        attribution = (ROOT / "docs" / "attribution.md").read_text(encoding="utf-8")
        setup_doc = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")

        self.assertIn("trending-github-ai", attribution)
        self.assertIn("trending-github-ai", setup_doc)
        self.assertIn("trending-github-ai", changelog)

        for name, repo in NEW_SKILLS:
            self.assertIn(name, attribution)
            self.assertIn(repo, attribution)
            self.assertIn(name, setup_doc)
            self.assertIn(repo, setup_doc)

if __name__ == "__main__":
    unittest.main()
