#!/usr/bin/env python3
"""Offline packaging contracts, not upstream UI or model-executed evaluations.

Run from the repository root:
    python3 -B scripts/test_ui_design_skills.py -v
Set JEO_UI_TEST_ROOT only when checking a different checkout.

Source-map contract: docs/ui-design-repositories.json is an object containing
schema_version=1 and sources=[{full_name,url,commit,observed_at,skill,
license_files:[{path,url}],license_notes:{expression,distribution,restrictions},
decision:"independent"}]. License URLs are pinned GitHub blob URLs. These are
provenance assertions, not a legal judgment or an online freshness check.
"""
from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(os.environ.get("JEO_UI_TEST_ROOT", Path(__file__).resolve().parents[1])).resolve()
EXPECTED = {
    "superdesign": ("superdesigndev/superdesign-skill", "f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b"),
    "better-design": ("marvkr/better-design", "e146625f3041ef8089a2013587435fc763dc3b15"),
    "design-taste": ("madebymustafa/design-taste", "c4a6bff0871eb4b15371b0e7d2751628b0ed4608"),
    "canvas-ui": ("DavidHDev/canvas-ui", "a04a99b235299ee79a123a16ccb2e6cf9da74b6b"),
    "paper-shaders": ("paper-design/shaders", "43cd68db79fa0b1759f72ffc941b3238e2a3954c"),
    "ui-layouts": ("ui-layouts/uilayouts", "88d827d7ec342917ca06f6894e5add65fabbe5d8"),
    "hyperiux": ("Hyperiux-Immersion-Labs/hyperiux-components", "71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba"),
    "motion-primitives": ("ibelick/motion-primitives", "120f64f6ca60348e251f929e9c81f11ccbe45eda"),
    "cursify": ("ui-layouts/cursify", "b3a173c33f12e74550389c9555f9ce85c30c46f6"),
    "trickle-ui": ("akaieuan/trickle-UI-kit", "41129071f15271046bdca5d2ca332231b59e8d4d"),
}
BUNDLE = "ui-design-repositories"
RESTRICTIONS = {
    "canvas-ui": {"no-component-redistribution"},
    "hyperiux": {"cli-license-not-effects", "effects-commercial-restricted"},
    "cursify": {"no-license-grant-observed"},
}
# Only parse the scalar fields this suite compares; this is not a YAML parser.
SCALAR = re.compile(r"^( *)([\w-]+):[ \t]*(.*)$", re.MULTILINE)
LINK = re.compile(r"\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise AssertionError(f"Missing frontmatter: {path}")
    header = text.split("\n---", 1)[0][4:]
    return {key: value.strip().strip("\"'") for _, key, value in SCALAR.findall(header)}


class UiDesignPackagingTests(unittest.TestCase):
    maxDiff = None

    def sources(self) -> list[dict]:
        data = read_json(ROOT / "docs/ui-design-repositories.json")
        self.assertEqual(data["schema_version"], 1)
        return data["sources"]

    def test_exact_ownership_pins_and_license_provenance(self):
        rows = self.sources()
        self.assertEqual(len(rows), len(EXPECTED))
        self.assertEqual({row["skill"] for row in rows}, set(EXPECTED))
        self.assertEqual(len({row["full_name"] for row in rows}), len(EXPECTED))
        for row in rows:
            with self.subTest(skill=row["skill"]):
                owner, commit = EXPECTED[row["skill"]]
                self.assertEqual((row["full_name"], row["commit"]), (owner, commit))
                self.assertEqual(row["url"], f"https://github.com/{owner}")
                observed = datetime.fromisoformat(row["observed_at"].replace("Z", "+00:00"))
                self.assertIsNotNone(observed.tzinfo)
                self.assertEqual(row["decision"], "independent")
                evidence = (ROOT / ".agent-skills" / row["skill"] / "references/upstream.md").read_text(encoding="utf-8")
                self.assertIn(owner, evidence)
                self.assertIn(commit, evidence)
                licenses = row["license_files"]
                self.assertIsInstance(licenses, list)
                self.assertEqual(len({item["path"] for item in licenses}), len(licenses))
                if row["skill"] != "cursify":
                    self.assertTrue(licenses, "license grant must have pinned file evidence")
                for item in licenses:
                    path = PurePosixPath(item["path"])
                    self.assertFalse(path.is_absolute())
                    self.assertNotIn("..", path.parts)
                    self.assertTrue(path.parts)
                    expected_url = f"https://github.com/{owner}/blob/{commit}/{quote(item['path'], safe='/')}"
                    self.assertEqual(item["url"], expected_url)
                    self.assertIn(expected_url, evidence)

    def test_catalog_metadata_matches_each_live_skill(self):
        catalog = read_json(ROOT / ".agent-skills/skills.json")
        index = {row["name"]: row for row in catalog["skills"]}
        for name, (owner, _) in EXPECTED.items():
            with self.subTest(skill=name):
                self.assertEqual(sum(row["name"] == name for row in catalog["skills"]), 1)
                row = index[name]
                self.assertEqual(row["category"], "web")
                self.assertIn(name, catalog["categories"]["web"])
                self.assertIn(row["subcategory"], catalog["taxonomy"]["web"]["subcategories"])
                self.assertIn(name, catalog["subcategories"]["web"][row["subcategory"]])
                self.assertEqual(row["path"], f"{name}/SKILL.md")
                meta = frontmatter(ROOT / ".agent-skills" / row["path"])
                self.assertEqual(meta["name"], name)
                self.assertEqual(str(row["version"]), meta["version"])
                self.assertTrue(meta["version"])
                self.assertEqual(set(row["allowed_tools"]), set(shlex.split(meta["allowed-tools"])))
                self.assertEqual(len(row["allowed_tools"]), len(set(row["allowed_tools"])))
                self.assertEqual(row["source"], meta["source"])
                self.assertIn(row["source"], (owner, f"https://github.com/{owner}"))
        # These have distinct jobs; adding source-specific operators must not retire them.
        for name in ("design-system", "web-design", "design-taste-frontend", "react-bits"):
            self.assertIn(name, index)
            self.assertTrue((ROOT / ".agent-skills" / name / "SKILL.md").is_file())
            self.assertNotIn(name, catalog.get("retired_skills", {}))

    def test_standalone_packages_resolve_their_own_support_links(self):
        with tempfile.TemporaryDirectory(prefix="ui-skill-copy-") as temp:
            for name in EXPECTED:
                with self.subTest(skill=name):
                    package = Path(temp).resolve() / name
                    shutil.copytree(ROOT / ".agent-skills" / name, package)
                    links = set(LINK.findall((package / "SKILL.md").read_text(encoding="utf-8")))
                    self.assertIn("references/upstream.md", links)
                    for document in package.rglob("*.md"):
                        for target in LINK.findall(document.read_text(encoding="utf-8")):
                            url = urlsplit(target)
                            if url.scheme or url.netloc or not url.path:
                                continue
                            resolved = (document.parent / unquote(url.path)).resolve()
                            self.assertTrue(resolved.is_relative_to(package), f"support escapes package: {document}: {target}")
                            self.assertTrue(resolved.is_file(), f"missing standalone support: {document}: {target}")

    def test_restricted_sources_do_not_inherit_permissive_grants(self):
        index = {row["skill"]: row for row in self.sources()}
        for name, row in index.items():
            with self.subTest(skill=name):
                notes = row["license_notes"]
                self.assertTrue(notes["expression"].strip())
                self.assertEqual(notes["distribution"], "reference-only")
                self.assertIsInstance(notes["restrictions"], list)
                self.assertTrue(RESTRICTIONS.get(name, set()) <= set(notes["restrictions"]))
        canvas = index["canvas-ui"]["license_notes"]["expression"].lower()
        self.assertIn("commons", canvas)
        self.assertIn("mit", canvas)
        hyper = index["hyperiux"]["license_notes"]["expression"].lower()
        self.assertIn("mit", hyper)
        self.assertNotEqual(hyper, "mit")
        self.assertEqual(index["cursify"]["license_files"], [])

    def test_evals_are_authored_cases_not_execution_evidence(self):
        for name in EXPECTED:
            with self.subTest(skill=name):
                data = read_json(ROOT / ".agent-skills" / name / "evals/evals.json")
                self.assertEqual(data["skill_name"], name)
                statuses = [data[key] for key in ("execution_status",) if key in data]
                if "execution" in data:
                    statuses.append(data["execution"]["status"])
                self.assertTrue(statuses, "authored fixtures must disclose nonexecution")
                self.assertLessEqual(set(statuses), {"not-run", "not_executed"})
                cases = data["evals"]
                self.assertGreaterEqual(len(cases), 2, "needs both an in-scope and a boundary case")
                self.assertEqual(len({case["id"] for case in cases}), len(cases))
                self.assertEqual(len({case["prompt"] for case in cases}), len(cases))
                for case in cases:
                    self.assertTrue(case["prompt"].strip())
                    behavior = case.get("expected_behavior")
                    if behavior is None:
                        self.assertTrue(case["expected_output"].strip())
                        behavior = case.get("assertions", case.get("expectations"))
                    if isinstance(behavior, str):
                        behavior = [behavior]
                    self.assertIsInstance(behavior, list)
                    self.assertTrue(behavior)
                    self.assertTrue(all(isinstance(item, str) and item.strip() for item in behavior))
                # Result metrics belong to a separately executed report, not authored fixtures.
                self.assertFalse({"pass_rate", "score", "results"} & data.keys())

    def test_bundle_dry_run_selects_only_ten_without_execution_or_writes(self):
        catalog_path = ROOT / ".agent-skills/skills.json"
        bundle = read_json(catalog_path)["bundles"][BUNDLE]
        self.assertEqual(len(bundle), len(EXPECTED))
        self.assertEqual(set(bundle), set(EXPECTED))
        router = ROOT / ".agent-skills/jeo-skill/scripts/jeo-skill.py"
        # The hook runs inside the CLI process: PATH shims alone would miss
        # absolute executables and would not prevent a catalog network fallback.
        guarded_run = (
            "import runpy, sys\n"
            "def forbid(event, args):\n"
            "    if event.startswith('socket.') or event in ('subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.exec'):\n"
            "        raise RuntimeError('dry-run external operation: ' + event)\n"
            "sys.addaudithook(forbid)\n"
            "script = sys.argv.pop(1)\n"
            "sys.path.insert(0, str(__import__('pathlib').Path(script).parent))\n"
            "sys.argv[0] = script\n"
            "runpy.run_path(script, run_name='__main__')\n"
        )
        with tempfile.TemporaryDirectory(prefix="ui-bundle-dry-run-") as temp:
            work = Path(temp).resolve()
            home = work / "home"
            home.mkdir()
            env = {
                "PATH": "", "HOME": str(home), "TMPDIR": str(work),
                "JEO_SKILLS_CATALOG": str(catalog_path),
                "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1",
            }
            result = subprocess.run(
                [sys.executable, "-B", "-c", guarded_run, str(router),
                 "install", "--bundle", BUNDLE, "--agent", "jeopi", "--dry-run"],
                cwd=work, env=env, text=True, capture_output=True, timeout=10, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            selected = next(line for line in result.stdout.splitlines() if line.startswith("Selected "))
            self.assertEqual(selected, f"Selected 10 skill(s): {', '.join(bundle)}")
            command = next(line.removeprefix("Command: ") for line in result.stdout.splitlines() if line.startswith("Command: "))
            argv = shlex.split(command)
            self.assertEqual(set(argv[argv.index("--skill") + 1:argv.index("--agent")]), set(EXPECTED))
            self.assertEqual(argv[argv.index("--agent") + 1], "universal")
            self.assertEqual(list(work.iterdir()), [home], "dry-run created installer state")
            self.assertEqual(list(home.iterdir()), [], "dry-run wrote home/cache state")


if __name__ == "__main__":
    unittest.main()
