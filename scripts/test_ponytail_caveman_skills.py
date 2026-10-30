#!/usr/bin/env python3
"""Regression tests for the ponytail and caveman skills (pinned upstream, installer contract)."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PONYTAIL = ROOT / ".agent-skills/ponytail"
CAVEMAN = ROOT / ".agent-skills/caveman"
INSTALL = PONYTAIL / "scripts/install.sh"
PONYTAIL_COMMIT = "7801d061243d7b753bad0e0b3c057cd250b11755"
CAVEMAN_COMMIT = "d262ab3882952a59312ff3537cd86d894523c5ab"


def manifest_entry(name):
    data = json.loads((ROOT / ".agent-skills/skills.json").read_text(encoding="utf-8"))
    return next(skill for skill in data["skills"] if skill["name"] == name)


def frontmatter_value(text, key):
    match = re.search(rf"^  {key}: \"?([^\"\n]+)\"?$", text, re.M)
    return match.group(1) if match else None


class PonytailInstallerTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="ponytail-install-")
        self.addCleanup(temp.cleanup)
        self.bin = Path(temp.name) / "bin"
        self.bin.mkdir()
        self.log = Path(temp.name) / "calls.log"

    def fake(self, *names):
        for name in names:
            path = self.bin / name
            path.write_text('#!/bin/sh\nprintf \'%s\\n\' "$(basename "$0") $*" >> "$CALL_LOG"\n', encoding="utf-8")
            path.chmod(0o755)

    def run_install(self, **env):
        return subprocess.run(
            ["/bin/bash", str(INSTALL)],
            env={"PATH": f"{self.bin}:/usr/bin:/bin", "CALL_LOG": str(self.log), "LANG": "en_US.UTF-8", **env},
            capture_output=True,
            text=True,
            timeout=30,
        )

    def calls(self):
        return self.log.read_text(encoding="utf-8").splitlines() if self.log.exists() else []

    def test_print_mode_without_clis_lists_current_install_lines_and_runs_nothing(self):
        result = self.run_install()
        self.assertEqual(result.returncode, 0, result.stderr)
        for line in (
            "codex plugin add ponytail@ponytail",
            "copilot plugin install ponytail@ponytail",
            "opencode plugin add @dietrichgebert/ponytail",
            "qwen extensions install DietrichGebert/ponytail:ponytail",
            "grok plugin install DietrichGebert/ponytail --trust",
        ):
            self.assertIn(line, result.stdout)
        self.assertNotIn("ponytail.mjs", result.stdout)
        self.assertEqual(self.calls(), [])

    def test_print_mode_shows_only_detected_hosts(self):
        self.fake("codex", "gemini")
        result = self.run_install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("codex:", result.stdout)
        self.assertIn("gemini:", result.stdout)
        self.assertNotIn("claude:", result.stdout)
        self.assertEqual(self.calls(), [])

    def test_apply_refuses_several_detected_hosts_without_runtime(self):
        self.fake("codex", "gemini")
        result = self.run_install(APPLY="1")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Set RUNTIME", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_apply_runs_exactly_the_named_hosts_steps(self):
        self.fake("codex", "gemini")
        result = self.run_install(APPLY="1", RUNTIME="codex")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.calls(),
            ["codex plugin marketplace add DietrichGebert/ponytail", "codex plugin add ponytail@ponytail"],
        )
        self.assertIn("/hooks", result.stdout)

    def test_apply_uses_the_openclaw_binary_name(self):
        self.fake("clawhub")
        result = self.run_install(APPLY="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), ["clawhub install ponytail"])

    def test_grok_is_never_auto_detected(self):
        self.fake("grok")
        result = self.run_install(APPLY="1")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.calls(), [])

    def test_unknown_runtime_fails_before_running_anything(self):
        self.fake("codex")
        result = self.run_install(APPLY="1", RUNTIME="cursor")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.calls(), [])


class SkillContentTests(unittest.TestCase):
    def test_ponytail_versions_and_pin_agree(self):
        skill = (PONYTAIL / "SKILL.md").read_text(encoding="utf-8")
        version = frontmatter_value(skill, "version")
        self.assertEqual(version, manifest_entry("ponytail")["version"])
        changelog = (PONYTAIL / "CHANGELOG.md").read_text(encoding="utf-8")
        self.assertEqual(re.search(r"^## \[([^\]]+)\]", changelog, re.M).group(1), version)
        self.assertEqual(frontmatter_value(skill, "upstream_commit"), PONYTAIL_COMMIT)
        for doc in ("references/commands.md", "README.md"):
            self.assertIn(PONYTAIL_COMMIT, (PONYTAIL / doc).read_text(encoding="utf-8"))
        entry = manifest_entry("ponytail")
        self.assertEqual((entry["category"], entry["subcategory"]), ("engineering", "code-quality"))

    def test_ponytail_carries_the_v5_contract(self):
        skill = (PONYTAIL / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("shortcut: <the limit>, <when to upgrade>", skill)
        self.assertIn("(shortcut|ponytail):", skill)
        for item in ("trust boundaries", "data", "security", "accessibility", "calibration", "anything the user asked for"):
            self.assertIn(item, skill)
        self.assertIn("Already in this codebase?", skill)
        self.assertNotRegex(skill, r"^  (category|tags):", "catalog metadata belongs in skills.json")

    def test_ponytail_folder_has_no_legacy_payload(self):
        files = [p for p in PONYTAIL.rglob("*") if p.is_file()]
        self.assertFalse([p for p in files if p.suffix == ".gif"], "legacy demo GIF is back")
        docs = [p for p in files if p.suffix in {".md", ".json", ".sh", ".svg"} and p.name != "CHANGELOG.md"]
        joined = "\n".join(p.read_text(encoding="utf-8") for p in docs)
        for stale in ("80–94%", "skills serve", '"plugin": ["./.opencode/plugins/ponytail.mjs"]', "@ponytail-review", "ponytail-demo"):
            self.assertNotIn(stale, joined)
        self.assertTrue((PONYTAIL / "LICENSE.upstream.txt").read_text(encoding="utf-8").startswith("MIT License"))

    def test_relative_links_resolve(self):
        for doc in (PONYTAIL / "SKILL.md", PONYTAIL / "README.md", CAVEMAN / "SKILL.md"):
            text = doc.read_text(encoding="utf-8")
            for target in re.findall(r"\]\(([^)#\s]+)\)", text):
                if "://" in target:
                    continue
                self.assertTrue((doc.parent / target).exists(), f"{doc.name}: broken link {target}")

    def test_caveman_follows_the_maintained_upstream(self):
        skill = (CAVEMAN / "SKILL.md").read_text(encoding="utf-8")
        entry = manifest_entry("caveman")
        self.assertEqual(frontmatter_value(skill, "source"), entry["source"])
        self.assertEqual(entry["source"], "https://github.com/JuliusBrussee/caveman")
        self.assertEqual(frontmatter_value(skill, "upstream_commit"), CAVEMAN_COMMIT)
        self.assertEqual(frontmatter_value(skill, "version"), entry["version"])
        self.assertTrue((CAVEMAN / "LICENSE.upstream.txt").read_text(encoding="utf-8").lstrip().startswith("Apache License"))
        self.assertNotIn("mattpocock", skill)
        self.assertNotIn("75%", skill)


if __name__ == "__main__":
    unittest.main()
