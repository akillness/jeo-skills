#!/usr/bin/env python3
"""Offline tests for the browser-use skill: manifest, pinned source manifest, evals, preflight and docs wiring.

Run: python3 -B scripts/test_browser_use_skill.py -v

Every preflight assertion runs the helper as a real subprocess against a throwaway HOME. Nothing here installs
browser-use, starts a browser, opens a socket or reads a real credential.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "browser-use"
SKILL = ROOT / ".agent-skills" / NAME
HELPER = SKILL / "scripts" / "preflight.py"
PIN = "dfb6a73d520809341c975c6a01c228327991e88b"
VERSION = "1.0.3"
SECRET = "bu_SYNTHETIC_SECRET_MUST_NEVER_APPEAR_0123456789"

# Commands in the audited `browser-use --help` text; the catalog must cover each of them.
CLI_SURFACE = (
    "login", "logout", "auth status", "--doctor", "doctor --fix-snap", "mac-approve", "--reload",
    "install", "skill show", "skill install", "feedback", "--cli-mcp", "--version",
)


def frontmatter(path: Path) -> dict:
    import yaml

    text = path.read_text(encoding="utf-8")
    return yaml.safe_load(text[3:text.find("\n---", 3)])


class BrowserUseSkillTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="browser-use-skill-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name).resolve()
        self.home = self.work / "home"
        self.home.mkdir()

    # ------------------------------------------------------------------ helpers
    def preflight(self, *args: str, path: str = "", **env: str) -> tuple[int, dict, str]:
        environment = {"HOME": str(self.home), "PATH": path}
        environment.update(env)
        proc = subprocess.run(
            [sys.executable, "-B", str(HELPER), *args],
            cwd=self.work, env=environment, capture_output=True, text=True, timeout=30,
        )
        data = json.loads(proc.stdout) if "--json" in args and proc.stdout.strip() else {}
        return proc.returncode, data, proc.stdout + proc.stderr

    @staticmethod
    def checks(data: dict) -> dict:
        return {item["name"]: item for item in data["checks"]}

    def snapshot(self) -> dict[str, bytes]:
        return {str(p.relative_to(self.work)): p.read_bytes() for p in self.work.rglob("*") if p.is_file()}

    def project(self, **files: str) -> Path:
        project = self.work / "project"
        project.mkdir(exist_ok=True)
        for name, content in files.items():
            (project / name.replace("__", ".")).write_text(content, encoding="utf-8")
        return project

    # ------------------------------------------------------- manifest and layout
    def test_manifest_entry_matches_skill_frontmatter(self) -> None:
        manifest = json.loads((ROOT / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))
        entry = next(s for s in manifest["skills"] if s["name"] == NAME)
        self.assertEqual(entry["path"], f"{NAME}/SKILL.md")
        self.assertEqual((entry["category"], entry["subcategory"]), ("web", "testing"))
        self.assertIn(NAME, manifest["categories"]["web"])
        self.assertIn(NAME, manifest["subcategories"]["web"]["testing"])
        front = frontmatter(SKILL / "SKILL.md")
        self.assertEqual(front["name"], NAME)
        self.assertEqual(" ".join(entry["description"].split()), " ".join(front["description"].split()))
        self.assertLessEqual(len(entry["description"]), 1024)
        self.assertNotIn("|", entry["description"])
        self.assertEqual(entry["source"], "https://github.com/browser-use/browser-use")
        self.assertEqual(front["metadata"]["upstream_commit"], PIN)
        self.assertEqual(front["metadata"]["upstream_version"], VERSION)
        self.assertEqual(front["license"], "MIT")
        self.assertLessEqual(len(" ".join(front["compatibility"].split())), 500)
        self.assertIsInstance(front["allowed-tools"], str)
        for forbidden in ("category", "subcategory", "tags", "relationships"):
            self.assertNotIn(forbidden, front)
            self.assertNotIn(forbidden, front["metadata"])
        self.assertEqual(manifest["skill_count"], len(manifest["skills"]))

    def test_description_names_triggers_and_route_outs(self) -> None:
        description = " ".join(frontmatter(SKILL / "SKILL.md")["description"].split())
        for needle in ("Use when", "browser-use==1.0.3", "--doctor", "skill install", "browser-harness", "playwriter", "stagehand", "Triggers on"):
            self.assertIn(needle, description)

    def test_relationship_groups_reference_real_siblings(self) -> None:
        manifest = json.loads((ROOT / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))
        names = {s["name"] for s in manifest["skills"]}
        groups = manifest["relationship_groups"]
        self.assertIn(NAME, groups["browser-evidence"]["members"])
        stack = groups["browser-use-stack"]
        self.assertEqual(stack["mode"], "layered")
        self.assertEqual(stack["members"], [NAME, "browser-harness", "jev-ultrafast"])
        self.assertLessEqual(set(stack["members"]), names)
        self.assertIn(PIN, stack["note"])

    def test_support_files_exist_and_links_resolve(self) -> None:
        for rel in ("SKILL.md", "SKILL.toon", "evals/evals.json", "scripts/preflight.py", "references/upstream.md",
                    "references/source.json", "references/command-catalog.md", "references/safety.md",
                    "references/library-and-cloud.md"):
            self.assertTrue((SKILL / rel).is_file(), rel)
        self.assertTrue(os.access(HELPER, os.X_OK))
        for doc in [SKILL / "SKILL.md", *sorted((SKILL / "references").glob("*.md"))]:
            for link in re.findall(r"\]\(((?!https?://|#|mailto:)[^)\s]+)\)", doc.read_text(encoding="utf-8")):
                target = (doc.parent / link.split("#", 1)[0]).resolve()
                self.assertTrue(target.exists(), f"{doc.name} -> {link}")

    def test_skill_md_follows_the_standard_layout(self) -> None:
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        for heading in ("## When to use this skill", "## Instructions", "## Examples", "## Best practices", "## References"):
            self.assertIn(heading, text)
        self.assertLess(len(text.splitlines()), 500)
        toon = (SKILL / "SKILL.toon").read_text(encoding="utf-8")
        self.assertTrue(toon.startswith(f"N:{NAME}\n"))

    def test_command_catalog_covers_the_audited_cli_surface(self) -> None:
        catalog = (SKILL / "references" / "command-catalog.md").read_text(encoding="utf-8")
        for command in CLI_SURFACE:
            self.assertIn(command, catalog, command)
        for tier_term in ("Tier", "browser_exec", "BU_NAME", "BH_OPEN_LIVE_URL", "ANONYMIZED_TELEMETRY"):
            self.assertIn(tier_term, catalog)

    def test_hazards_are_recorded_where_operators_read_them(self) -> None:
        skill = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        safety = (SKILL / "references" / "safety.md").read_text(encoding="utf-8")
        upstream = (SKILL / "references" / "upstream.md").read_text(encoding="utf-8")
        self.assertIn("Do not run `browser-use skill install`", skill)
        for needle in ("symlink", "x402", "stop_remote_daemon", "not a sandbox", "ANONYMIZED_TELEMETRY=false", "mac-approve"):
            self.assertTrue(needle in skill or needle in safety, needle)
        self.assertIn("agent_helpers.py", upstream)
        self.assertIn("**executed**", safety)
        self.assertIn("byte-identical", upstream)

    # ------------------------------------------------------------ source manifest
    def test_source_manifest_shape_and_pin(self) -> None:
        source = json.loads((SKILL / "references" / "source.json").read_text(encoding="utf-8"))
        self.assertEqual(source["schema_version"], 1)
        self.assertEqual(source["skill"], NAME)
        self.assertEqual(source["repository"], "browser-use/browser-use")
        self.assertEqual(source["commit"], PIN)
        self.assertEqual(source["upstream_version"], VERSION)
        self.assertEqual(source["release"]["tag_commit"], PIN)
        self.assertEqual(source["license"]["spdx"], "MIT")
        self.assertEqual(source["pypi"]["requires_python"], ">=3.11,<4.0")
        self.assertEqual(source["pinned_runtime_dependencies"]["browser-harness"], "0.1.13")
        paths = [item["path"] for item in source["files"]]
        self.assertEqual(len(paths), len(set(paths)))
        for item in source["files"]:
            self.assertRegex(item["sha256"], r"^[0-9a-f]{64}$")
            self.assertIsInstance(item["bytes"], int)
            self.assertGreater(item["bytes"], 0)
        self.assertLessEqual({"README.md", "LICENSE", "pyproject.toml", "MIGRATING.md", "browser_use/cli.py",
                              "browser_use/skills/install.py", "skills/browser-use/SKILL.md"}, set(paths))
        for item in source["pypi"]["files"]:
            self.assertRegex(item["sha256"], r"^[0-9a-f]{64}$")

    def test_pin_is_consistent_across_every_surface(self) -> None:
        for path in (SKILL / "SKILL.md", SKILL / "references" / "upstream.md", HELPER, ROOT / "setup-all-skills-prompt.md"):
            self.assertIn(PIN, path.read_text(encoding="utf-8"), path.name)
        self.assertIn(PIN[:7], (ROOT / "docs" / "attribution.md").read_text(encoding="utf-8"))
        source = subprocess.run([sys.executable, "-B", str(HELPER), "--help"], capture_output=True, text=True, check=True).stdout
        self.assertIn(PIN, source)

    # --------------------------------------------------------------------- evals
    def test_evals_are_well_formed_and_cover_the_hazards(self) -> None:
        data = json.loads((SKILL / "evals" / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(data["skill_name"], NAME)
        ids = [e["id"] for e in data["evals"]]
        self.assertEqual(ids, sorted(set(ids)))
        self.assertGreaterEqual(len(ids), 8)
        for case in data["evals"]:
            self.assertTrue(case["prompt"] and case["expected_output"])
            self.assertGreaterEqual(len(case["assertions"]), 2)
        corpus = " ".join(a for e in data["evals"] for a in e["assertions"] + [e["expected_output"]])
        for phrase in ("skill install", "stop_remote_daemon", "x402", "not a sandbox", "ANONYMIZED_TELEMETRY",
                       "browser-use==1.0.3", "playwriter", "stagehand", "runtime_verified", "BU_NAME"):
            self.assertIn(phrase, corpus)

    # ------------------------------------------------------------ preflight: CLI
    def test_help_and_invalid_input_follow_the_shared_contract(self) -> None:
        code, _, out = self.preflight("--help")
        self.assertEqual(code, 0)
        for flag in ("--json", "--repo", "--expect-commit", "--project"):
            self.assertIn(flag, out)
        for args in (("--json", "--expect-commit", PIN), ("--json", "--repo", str(self.work), "--expect-commit", "abc"),
                     ("--json", "--bogus"), ("--json", "--repo")):
            code, data, _ = self.preflight(*args)
            self.assertEqual(code, 2, args)
            self.assertEqual(data["status"], "error")
            self.assertFalse(data["runtime_verified"])

    def test_report_is_offline_and_never_writes(self) -> None:
        before = self.snapshot()
        code, data, _ = self.preflight("--json")
        self.assertEqual(code, 1)  # empty PATH: no install route
        self.assertEqual((data["skill"], data["scope"], data["runtime_verified"]), (NAME, "offline-preflight", False))
        self.assertEqual(self.checks(data)["install_route"]["status"], "blocked")
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(any(self.home.iterdir()))

    def test_any_install_route_on_path_is_enough_and_is_never_executed(self) -> None:
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        marker = self.work / "executed"
        for tool in ("uv", "browser-use"):
            shim = bin_dir / tool
            shim.write_text(f"#!/bin/sh\ntouch '{marker}'\nexit 97\n")
            shim.chmod(0o755)
        code, data, _ = self.preflight("--json", path=str(bin_dir))
        checks = self.checks(data)
        self.assertEqual(checks["install_route"]["status"], "ok")
        self.assertEqual(Path(checks["cli"]["path"]).name, "browser-use")
        self.assertEqual(code, 0, data)
        self.assertFalse(marker.exists(), "a discovered tool must never be executed")

    # ------------------------------------------------ preflight: telemetry and env
    def test_telemetry_default_is_reported_and_env_opt_outs_are_honored(self) -> None:
        _, data, _ = self.preflight("--json")
        default = self.checks(data)["telemetry"]
        self.assertTrue(default["library_enabled"])
        self.assertIn("ON by default", default["detail"])
        for env, expect_off in (({"ANONYMIZED_TELEMETRY": "false"}, True), ({"BH_TELEMETRY": "0"}, True),
                                ({"ANONYMIZED_TELEMETRY": "no"}, True), ({"ANONYMIZED_TELEMETRY": "true"}, False),
                                ({"ANONYMIZED_TELEMETRY": ""}, True)):
            _, data, _ = self.preflight("--json", **env)
            check = self.checks(data)["telemetry"]
            self.assertEqual("switched off" in check["detail"], expect_off, env)

    def test_credential_and_override_variables_are_reported_by_name_only(self) -> None:
        env = {"BROWSER_USE_API_KEY": SECRET, "OPENAI_API_KEY": SECRET, "BU_CDP_URL": "wss://x?apiKey=" + SECRET,
               "BROWSER_USE_ALLOWED_DOMAINS": "evil.example"}
        code, data, out = self.preflight("--json", **env)
        checks = self.checks(data)
        self.assertNotIn(SECRET, out)
        self.assertTrue(checks["credentials_env"]["present"]["BROWSER_USE_API_KEY"])
        self.assertTrue(checks["credentials_env"]["present"]["OPENAI_API_KEY"])
        self.assertFalse(checks["credentials_env"]["present"]["ANTHROPIC_API_KEY"])
        self.assertIn("BU_CDP_URL", checks["env_overrides"]["present"])
        self.assertEqual(checks["env_legacy"]["status"], "warn")
        self.assertIn("BROWSER_USE_ALLOWED_DOMAINS", checks["env_legacy"]["present"])

    # ----------------------------------------------------- preflight: state paths
    def test_state_paths_are_reported_without_reading_them(self) -> None:
        config = self.home / ".config" / "browser-harness"
        (config / "agent-workspace").mkdir(parents=True)
        (config / "runtime").mkdir()
        (config / "auth.json").write_text(json.dumps({"api_key": SECRET}))
        (config / "agent-workspace" / "agent_helpers.py").write_text(f"SECRET = '{SECRET}'\nraise SystemExit(1)\n")
        (config / "runtime" / "bu-r7k2.cloud").write_text("cloud-browser-id-" + SECRET)
        (config / "runtime" / "bu-done.cloud").write_text("")
        before = self.snapshot()
        _, data, out = self.preflight("--json")
        checks = self.checks(data)
        self.assertNotIn(SECRET, out)
        self.assertTrue(checks["state_stored_key"]["present"])
        helpers = checks["state_agent_helpers"]
        self.assertEqual(helpers["status"], "warn")
        self.assertTrue(helpers["present"])
        markers = checks["state_cloud_markers"]
        self.assertEqual(markers["status"], "warn")
        self.assertEqual(markers["markers"], ["bu-r7k2.cloud"], "an empty marker means the browser was stopped")
        self.assertEqual(self.snapshot(), before)

    def test_harness_path_overrides_are_followed(self) -> None:
        relocated = self.work / "relocated"
        relocated.mkdir()
        (relocated / "auth.json").write_text("{}")
        _, data, _ = self.preflight("--json", BH_HOME=str(relocated))
        self.assertTrue(self.checks(data)["state_stored_key"]["present"])
        xdg = self.work / "xdg"
        (xdg / "browser-harness").mkdir(parents=True)
        (xdg / "browser-harness" / "auth.json").write_text("{}")
        _, data, _ = self.preflight("--json", XDG_CONFIG_HOME=str(xdg))
        self.assertTrue(self.checks(data)["state_stored_key"]["present"])
        _, data, _ = self.preflight("--json")
        self.assertFalse(self.checks(data)["state_stored_key"]["present"])

    def test_skill_install_collision_classifies_who_owns_each_copy(self) -> None:
        upstream = self.home / ".agents" / "skills" / NAME
        upstream.mkdir(parents=True)
        (upstream / "SKILL.md").write_text('---\nname: browser-use\nhomepage: https://browser-use.com\nmetadata:\n  {"openclaw": {}}\n---\n')
        catalog = self.home / ".codex" / "skills" / NAME
        catalog.mkdir(parents=True)
        (catalog / "SKILL.md").write_text("---\nname: browser-use\nmetadata:\n  upstream_commit: " + PIN + "\n---\n")
        (self.home / ".claude" / "skills").mkdir(parents=True)
        (self.home / ".claude" / "skills" / NAME).symlink_to(upstream, target_is_directory=True)
        _, data, _ = self.preflight("--json")
        check = self.checks(data)["skill_install_collision"]
        self.assertEqual(check["status"], "warn")
        by_target = {item["target"]: item for item in check["entries"]}
        self.assertEqual(by_target["agents"]["skill_md"], "upstream")
        self.assertEqual(by_target["codex"]["skill_md"], "catalog")
        self.assertEqual(by_target["claude"]["kind"], "symlink")
        self.assertEqual(by_target["claude"]["skill_md"], "upstream")
        self.assertIn("overwrites", check["detail"])

    def test_hostile_project_files_are_bounded_in_time_and_output(self) -> None:
        import time

        project = self.project(
            requirements__txt="\n" * 4_000_000,                  # quadratic for a naive `^\s*...` multiline scan
            pyproject__toml="\n" * 4_000_000,
            uv__lock='name = "browser-use"' + " " * 4_000_000,
        )
        # 150 long matching lines: must not become 150 report entries
        (project / "requirements-dev.txt").write_text(("browser-use" + " " * 20_000 + "\n") * 150, encoding="utf-8")
        started = time.monotonic()
        code, data, _ = self.preflight("--json", "--project", str(project), path=os.environ.get("PATH", ""))
        self.assertLess(time.monotonic() - started, 15, "project scan must stay linear")
        pins = [c for c in data["checks"] if c["name"].startswith("project.pin")]
        self.assertLessEqual(len(pins), 25, "one file must not flood the report")
        self.assertTrue(any(c["name"] == "project.pin_truncated:requirements-dev.txt" for c in pins))
        self.assertEqual(self.checks(data)["project_dependency"]["sources"], ["requirements-dev.txt"])

    def test_pin_classifier_handles_prerelease_and_junk_specifiers(self) -> None:
        import importlib.util

        spec = importlib.util.spec_from_file_location("browser_use_preflight", HELPER)
        module = importlib.util.module_from_spec(spec)
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
        classify = module.classify_spec
        self.assertEqual(classify("==1.0.3"), ("exact-1x", "1.0.3"))
        self.assertEqual(classify("==1rc1"), ("exact-1x", "1rc1"))
        self.assertEqual(classify("==1.0.3rc1"), ("exact-1x", "1.0.3rc1"))
        self.assertEqual(classify("==0.11.3"), ("exact-0x", "0.11.3"))
        self.assertEqual(classify("==2.0"), ("exact-other", "2.0"))
        self.assertEqual(classify("==1.0.3 --hash=sha256:ab"), ("exact-1x", "1.0.3"))
        self.assertEqual(classify("==1.0.3 ; python_version > '3.11'"), ("exact-1x", "1.0.3"))
        for junk in (">=1.0", "~=1.0.3", "==1.0.*", "==!1", "@ git+https://example.invalid/x", "==1" + ".1" * 8000 + "!"):
            self.assertEqual(classify(junk)[0], "range", junk)
        self.assertEqual(classify(""), ("unpinned", None))

    def test_catalog_only_install_is_not_a_collision_warning(self) -> None:
        catalog = self.home / ".agents" / "skills" / NAME
        catalog.mkdir(parents=True)
        (catalog / "SKILL.md").write_bytes((SKILL / "SKILL.md").read_bytes())
        _, data, _ = self.preflight("--json")
        check = self.checks(data)["skill_install_collision"]
        self.assertEqual(check["status"], "info")
        self.assertEqual([item["skill_md"] for item in check["entries"]], ["catalog"])

    def test_local_browser_candidates_are_found_by_override_and_never_executed(self) -> None:
        marker = self.work / "executed"
        browser = self.work / "my-chrome"
        browser.write_text(f"#!/bin/sh\ntouch '{marker}'\n")
        browser.chmod(0o755)
        _, data, _ = self.preflight("--json", BH_CHROME_PATH=str(browser))
        check = self.checks(data)["local_browser"]
        self.assertEqual(check["status"], "ok")
        self.assertIn(str(browser), check["candidates"])
        self.assertFalse(marker.exists())

    @unittest.skipUnless(sys.platform.startswith("linux"), "Snap detection is Linux-only")
    def test_snap_chromium_is_flagged(self) -> None:
        snap = self.work / "snap" / "bin"
        snap.mkdir(parents=True)
        chromium = snap / "chromium"
        chromium.write_text("#!/bin/sh\nexit 0\n")
        chromium.chmod(0o755)
        _, data, _ = self.preflight("--json", BH_CHROME_PATH=str(chromium))
        checks = self.checks(data)
        self.assertEqual(checks["snap_chromium"]["status"], "warn")
        self.assertNotIn(str(chromium), checks["local_browser"].get("candidates", []))

    # ----------------------------------------------------- preflight: project pin
    def test_project_pin_classification(self) -> None:
        project = self.project(
            pyproject__toml='[project]\ndependencies = [\n  "browser-use[cli]==1.0.3",\n  # "browser-use==0.5.0",\n'
                            '  "browser-use-sdk>=3",\n  "requests",\n]\n[tool.poetry.dependencies]\nbrowser-use = "1.0.1"\n',
            requirements__txt="# browser-use==0.1\nbrowser-use>=1.0\nbrowser_use_sdk==9\n",
            uv__lock='[[package]]\nname = "browser-use"\nversion = "1.0.3"\n',
        )
        code, data, _ = self.preflight("--json", "--project", str(project), path=os.environ.get("PATH", ""))
        checks = self.checks(data)
        self.assertEqual(checks["project.pin:pyproject.toml"]["status"], "ok")
        self.assertEqual(checks["project.pin:pyproject.toml"]["version"], "1.0.3")
        self.assertEqual(checks["project.pin:pyproject.toml#2"]["version"], "1.0.1")
        self.assertEqual(checks["project.pin:requirements.txt"]["status"], "warn")
        self.assertEqual(checks["project.pin:requirements.txt"]["kind"], "range")
        self.assertEqual(checks["project.pin:uv.lock"]["version"], "1.0.3")
        self.assertNotIn("project.pin:requirements.txt#2", checks, "browser-use-sdk is a different package")
        self.assertNotIn("project.pin:pyproject.toml#3", checks, "a commented dependency must not count")

    def test_project_flags_zero_x_pins_and_missing_dependency(self) -> None:
        old = self.project(requirements__txt="browser-use==0.11.3\n")
        _, data, _ = self.preflight("--json", "--project", str(old), path=os.environ.get("PATH", ""))
        check = self.checks(data)["project.pin:requirements.txt"]
        self.assertEqual((check["status"], check["kind"]), ("warn", "exact-0x"))
        self.assertIn("library-and-cloud.md", check["detail"])
        empty = self.work / "empty-project"
        empty.mkdir()
        _, data, _ = self.preflight("--json", "--project", str(empty), path=os.environ.get("PATH", ""))
        self.assertIn("no browser-use dependency", self.checks(data)["project_dependency"]["detail"])

    def test_project_dotenv_is_never_read_and_symlinks_are_refused(self) -> None:
        project = self.project(pyproject__toml='dependencies = ["browser-use==1.0.3"]\n')
        (project / ".env").write_text(f"BROWSER_USE_API_KEY={SECRET}\n")
        _, data, out = self.preflight("--json", "--project", str(project), path=os.environ.get("PATH", ""))
        self.assertNotIn(SECRET, out)
        self.assertTrue(self.checks(data)["project_dotenv"]["present"])
        link = self.work / "project-link"
        link.symlink_to(project, target_is_directory=True)
        code, data, _ = self.preflight("--json", "--project", str(link), path=os.environ.get("PATH", ""))
        self.assertEqual(code, 1)
        self.assertEqual(self.checks(data)["project"]["status"], "blocked")
        (project / "pyproject.toml").unlink()
        (project / "pyproject.toml").symlink_to(self.work / "elsewhere.toml")
        _, data, _ = self.preflight("--json", "--project", str(project), path=os.environ.get("PATH", ""))
        self.assertIn("symlink", self.checks(data)["project.pin:pyproject.toml"]["detail"])

    # ------------------------------------------------------ preflight: checkout
    def test_repo_markers_and_pin(self) -> None:
        git = shutil.which("git")
        if git is None:
            self.skipTest("git is required to build a checkout fixture")
        repo = self.work / "checkout"
        for marker in ("README.md", "LICENSE", "pyproject.toml", "AGENTS.md", "MIGRATING.md", "browser_use/__init__.py",
                       "browser_use/cli.py", "browser_use/skills/install.py", "skills/browser-use/SKILL.md"):
            target = repo / marker
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("public marker\n")
        run = lambda *a: subprocess.run([git, "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@invalid", *a],  # noqa: E731
                                        capture_output=True, text=True, check=True).stdout.strip()
        run("init", "--quiet")
        run("add", ".")
        run("commit", "--quiet", "-m", "fixture")
        head = run("rev-parse", "HEAD")
        path = os.environ.get("PATH", "")
        code, data, _ = self.preflight("--json", "--repo", str(repo), "--expect-commit", head, path=path)
        self.assertEqual(code, 0, data)
        code, data, _ = self.preflight("--json", "--repo", str(repo), "--expect-commit", PIN, path=path)
        self.assertEqual((code, self.checks(data)["repo_commit"]["status"]), (1, "blocked"))
        (repo / "browser_use" / "cli.py").unlink()
        code, data, _ = self.preflight("--json", "--repo", str(repo), path=path)
        self.assertEqual(code, 1)
        self.assertEqual(self.checks(data)["repo.file:browser_use/cli.py"]["status"], "blocked")

    # ------------------------------------------------------------- docs wiring
    def test_readmes_changelog_attribution_and_setup_guide(self) -> None:
        heading = "Browser Use operator (on demand, billed and can control your Chrome)"
        # GitHub anchor: lowercase, punctuation dropped, spaces to hyphens.
        slug = re.sub(r"\s+", "-", re.sub(r"[^\w\s-]", "", heading.lower()).strip())
        self.assertEqual(slug, "browser-use-operator-on-demand-billed-and-can-control-your-chrome")
        for name in ("README.md", "README.ko.md", "README.es-ES.md"):
            text = (ROOT / name).read_text(encoding="utf-8")
            self.assertIn(f"| `{NAME}` |", text, name)
            self.assertIn("browser-use skill install", text, name)
            self.assertIn(f"(setup-all-skills-prompt.md#{slug})", text, name)
        guide = (ROOT / "setup-all-skills-prompt.md").read_text(encoding="utf-8")
        self.assertEqual(guide.count(f"\n### {heading}\n"), 1)
        section = guide.split(f"### {heading}", 1)[1].split("\n### ", 1)[0].split("\n---\n", 1)[0]
        for token in (PIN, "jeo-skill install browser-use --global --dry-run", "--yes", "browser-use==1.0.3",
                      "ANONYMIZED_TELEMETRY=false", "skill install", "runtime_verified", "preflight.py", "stop_remote_daemon"):
            self.assertIn(token, section)
        attribution = (ROOT / "docs" / "attribution.md").read_text(encoding="utf-8")
        row = next(line for line in attribution.splitlines() if line.startswith(f"| `{NAME}`"))
        self.assertIn(PIN, row)
        self.assertIn("MIT", row)
        self.assertIn(NAME, (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"))
        for lang in ("en", "ko"):
            self.assertIn(f"`{NAME}`", (ROOT / "changelog" / lang / "2026-11.md").read_text(encoding="utf-8"), lang)

    def test_ci_runs_this_suite_and_the_shared_contract_covers_the_helper(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("python3 -B scripts/test_browser_use_skill.py -v", workflow)
        shared = (ROOT / "scripts" / "test_repository_preflight_regressions.py").read_text(encoding="utf-8")
        self.assertIn(f'"{NAME}",\n)', shared)
        self.assertIn('"browser_use/cli.py"', shared)

    def test_documented_flags_are_real(self) -> None:
        help_text = subprocess.run([sys.executable, "-B", str(HELPER), "--help"], capture_output=True, text=True, check=True).stdout
        documented: set[str] = set()
        for path in (SKILL / "SKILL.md", ROOT / "setup-all-skills-prompt.md"):
            text = path.read_text(encoding="utf-8").replace("\\\n", " ")
            for line in text.splitlines():
                if "browser-use/scripts/preflight.py" in line:
                    documented |= set(re.findall(r"--[a-z][a-z-]+", line))
        self.assertEqual({"--json", "--repo", "--expect-commit", "--project"} - documented, set(), "every flag is documented")
        for flag in documented:
            self.assertIn(flag, help_text, f"{flag} is documented but the helper does not accept it")


if __name__ == "__main__":
    unittest.main(verbosity=2)
