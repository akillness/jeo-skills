#!/usr/bin/env python3
"""Offline contract tests for the caviri/rete source-pinned skill package."""

from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SKILL_DIR = ROOT / ".agent-skills" / "rete"
PINNED_COMMIT = "c38b7ffb304dfaeb9c8ad3a37dd6416678e198e0"


class ReteSkillContractTests(unittest.TestCase):
    def test_preflight_runs_offline_and_matches_manifest(self) -> None:
        source_manifest = json.loads((SKILL_DIR / "references" / "source.json").read_text(encoding="utf-8"))
        self.assertEqual(source_manifest["skill"], "rete")
        self.assertEqual(source_manifest["repository"], "caviri/rete")
        self.assertEqual(source_manifest["commit"], PINNED_COMMIT)
        self.assertEqual(source_manifest["license"], "Apache-2.0")
        self.assertEqual(len(source_manifest["files"]), 10)

        proc = subprocess.run(
            [sys.executable, str(SKILL_DIR / "scripts" / "preflight.py"), "--json"],
            cwd=str(SKILL_DIR),
            capture_output=True,
            text=True,
            check=True,
        )
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["skill"], "rete")
        self.assertEqual(payload["repository"], "caviri/rete")
        self.assertEqual(payload["expected_commit"], PINNED_COMMIT)
        self.assertFalse(payload["source_checked"])
        self.assertFalse(payload["runtime_verified"])
        self.assertEqual(len(payload["checks"]), len(source_manifest["tools"]))

    def test_preflight_repo_verification_detects_tampered_digest(self) -> None:
        manifest = json.loads((SKILL_DIR / "references" / "source.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp).resolve()
            repo_dir = tmp_path / "repo"
            repo_dir.mkdir()
            # Test matching fails when content digest differs from manifest pin
            for entry in manifest["files"]:
                target = repo_dir / entry["path"]
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("tampered\n", encoding="utf-8")

            bad = subprocess.run(
                [sys.executable, str(SKILL_DIR / "scripts" / "preflight.py"), "--json", "--repo", str(repo_dir)],
                cwd=str(SKILL_DIR),
                capture_output=True,
                text=True,
            )
            self.assertEqual(bad.returncode, 1)
            bad_payload = json.loads(bad.stdout)
            self.assertEqual(bad_payload["status"], "blocked")
            self.assertTrue(bad_payload["source_checked"])
            mismatches = [c for c in bad_payload["checks"] if c["name"].startswith("file:") and c["status"] == "mismatch"]
            self.assertEqual(len(mismatches), 10)

            # Verify a custom manifest aligned to temp file hashes succeeds offline
            alt_manifest = dict(manifest)
            alt_files = []
            for entry in manifest["files"]:
                target = repo_dir / entry["path"]
                digest = hashlib.sha256(target.read_bytes()).hexdigest()
                alt_files.append({**entry, "sha256": digest})
            alt_manifest["files"] = alt_files

            alt_skill = tmp_path / "rete"
            (alt_skill / "references").mkdir(parents=True)
            (alt_skill / "scripts").mkdir(parents=True)
            (alt_skill / "references" / "source.json").write_text(
                json.dumps(alt_manifest, indent=2), encoding="utf-8"
            )
            preflight_copy = alt_skill / "scripts" / "preflight.py"
            preflight_copy.write_text((SKILL_DIR / "scripts" / "preflight.py").read_text(encoding="utf-8"), encoding="utf-8")

            ok = subprocess.run(
                [sys.executable, str(preflight_copy), "--json", "--repo", str(repo_dir)],
                cwd=str(alt_skill),
                capture_output=True,
                text=True,
                check=True,
            )
            ok_payload = json.loads(ok.stdout)
            self.assertEqual(ok_payload["status"], "ok")
            self.assertTrue(ok_payload["source_checked"])
            matches = [c for c in ok_payload["checks"] if c["name"].startswith("file:") and c["status"] == "match"]
            self.assertEqual(len(matches), 10)

    def test_catalog_package_boundaries_and_docs_are_synced(self) -> None:
        skills_json = json.loads((ROOT / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))
        entries = {s["name"]: s for s in skills_json["skills"]}
        self.assertIn("rete", entries)
        rete_entry = entries["rete"]
        self.assertEqual(rete_entry["category"], "infrastructure")
        self.assertEqual(rete_entry["subcategory"], "cloud-data")
        self.assertEqual(rete_entry["interface"], "cli")
        self.assertEqual(rete_entry["source"], "https://github.com/caviri/rete")
        self.assertIn("rete", skills_json["categories"]["infrastructure"])
        self.assertIn("rete", skills_json["subcategories"]["infrastructure"]["cloud-data"])

        group = skills_json["relationship_groups"]["rdf-archives-and-single-file-stores"]
        self.assertEqual(group["members"], ["rete", "open-ontologies", "pmtiles"])

        for rel in ("SKILL.md", "SKILL.toon", "references/upstream.md", "references/source.json", "evals/evals.json", "scripts/preflight.py"):
            self.assertTrue((SKILL_DIR / rel).is_file(), f"Missing {rel}")

        evals = json.loads((SKILL_DIR / "evals" / "evals.json").read_text(encoding="utf-8"))
        self.assertTrue(evals["authored"])
        self.assertFalse(evals["executed"])
        self.assertGreaterEqual(len(evals["evals"]), 4)

        skill_md = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        for expected in (
            "0x08",
            "0x05",
            "rete-graph",
            "--fetch-contexts",
            "katospiegel-rete.hf.space/mcp/",
            "rete.mcpb",
            "rete recard --in-place",
            "open-ontologies",
            "pmtiles",
        ):
            self.assertIn(expected, skill_md)

        setup_doc = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        self.assertIn("### Rete single-file RDF archive & SPARQL operator (on demand)", setup_doc)
        self.assertIn(PINNED_COMMIT, setup_doc)

        attribution_doc = (ROOT / "docs" / "attribution.md").read_text(encoding="utf-8")
        self.assertIn("caviri/rete", attribution_doc)
        self.assertIn(PINNED_COMMIT, attribution_doc)

        for readme in ("README.md", "README.ko.md", "README.es-ES.md"):
            text = (ROOT / readme).read_text(encoding="utf-8")
            self.assertIn("[`rete`](.agent-skills/rete/SKILL.md)", text)
            self.assertNotIn("≔", text)


if __name__ == "__main__":
    unittest.main()
