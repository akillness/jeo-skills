#!/usr/bin/env python3
"""Black-box installer regressions; no network, user HOME, or runtime credentials.

The npx boundary emulates skills add's canonical IDs, copy/symlink modes and
nested discovery. Production entrypoints and all filesystem mirroring are real.
Run: python3 scripts/test_installer_regressions.py -v
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / ".agent-skills/jeo-skill/scripts/jeo-skill.py"

NPX = r'''import os
from pathlib import Path
import shutil
import sys

args = sys.argv[1:]
if args == ["--version"]:
    print("fixture")
    raise SystemExit(0)
if os.environ.get("TRANSPORT_FAILURE"):
    print("fixture transport refused installation", file=sys.stderr)
    raise SystemExit(23)
if os.environ.get("TRANSPORT_NO_OUTPUT"):
    raise SystemExit(0)
if args[:3] not in (["--yes", "skills", "add"], ["--yes", "skills@1.7.0", "add"]):
    raise SystemExit("unexpected transport command")
source = Path(args[3])
if not source.is_dir():
    raise SystemExit("fixture transport forbids remote sources")
agent = args[args.index("--agent") + 1]
paths = {
    "universal": (".agents/skills", ".agents/skills"),
    "pi": (".pi/skills", ".pi/agent/skills"),
    "claude-code": (".claude/skills", ".claude/skills"),
    "antigravity-cli": (".agents/skills", ".agents/skills"),
    "antigravity": (".agents/skills", ".agents/skills"),
}
if agent not in paths:
    raise SystemExit("unsupported upstream agent: " + agent)
global_install = "--global" in args
base = Path.home() if global_install else Path.cwd()
destination = base / paths[agent][int(global_install)]
names = []
for value in args[args.index("--skill") + 1:]:
    if value.startswith("--"):
        break
    names.append(value)
if "--full-depth" not in args:
    raise SystemExit("fixture nested skills require full-depth discovery")
if names == ["*"]:
    names = sorted(path.name for path in (source / ".agent-skills").iterdir() if path.is_dir())
for name in names:
    origin = source / ".agent-skills" / name
    target = destination / name
    destination.mkdir(parents=True, exist_ok=True)
    if target.is_symlink():
        target.unlink()
    if "--copy" in args:
        shutil.copytree(origin, target, dirs_exist_ok=True)
    elif not target.exists():
        target.symlink_to(origin, target_is_directory=True)
'''


class InstallerRegressions(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jeo-installer-test-")
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.home = self.work / "home"
        self.project = self.work / "project with spaces"
        self.source = self.work / "source with spaces"
        self.bin = self.work / "bin"
        for directory in (self.home, self.project, self.source, self.bin):
            directory.mkdir()
        shutil.copytree(ROOT / ".agent-skills/jeo-skill", self.source / ".agent-skills/jeo-skill")
        for name in ("alpha", "beta"):
            skill = self.source / ".agent-skills" / name
            skill.mkdir()
            (skill / "SKILL.md").write_text(f"---\nname: {name}\ndescription: fixture\n---\n{name} payload\n")
            (skill / "references").mkdir()
            (skill / "references/evidence.txt").write_text(f"{name} nested payload\n")
        self.catalog = self.work / "catalog.json"
        self.catalog.write_text(json.dumps({
            "version": "test",
            "skills": [
                {"name": name, "category": "engineering", "subcategory": "testing", "description": "fixture"}
                for name in ("jeo-skill", "alpha", "beta")
            ],
            "categories": {"engineering": {}},
            "subcategories": {},
            "bundles": {"pair": ["alpha", "beta"]},
        }))
        npx = self.bin / "npx"
        npx.write_text(f"#!{sys.executable}\n" + NPX)
        npx.chmod(0o700)
        # Do not inherit runtime config, credentials or a user's installer options.
        self.env = {
            "PATH": str(self.bin) + os.pathsep + os.defpath,
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "PYTHONDONTWRITEBYTECODE": "1",
            "JEO_SKILLS_CATALOG": str(self.catalog),
            "JEO_SKILLS_SOURCE": str(self.source),
        }
        (self.bin / "python3").symlink_to(sys.executable)
        node = os.environ.get("INSTALLER_TEST_NODE") or shutil.which("node")
        self.assertIsNotNone(node, "Node.js is required; INSTALLER_TEST_NODE may select a real supported binary")
        (self.bin / "node").symlink_to(node)

    def cli(self, *args, extra_env=None):
        return self.execute([sys.executable, str(ROUTER), *args], extra_env)

    def bootstrap(self, **options):
        return self.execute(["/bin/bash", str(ROOT / "install.sh")], options)

    def execute(self, command, extra_env=None):
        return subprocess.run(command, cwd=self.project, env={**self.env, **(extra_env or {})},
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)

    def successful(self, result):
        self.assertEqual(result.returncode, 0, result.stdout)

    def assert_skill(self, root, name):
        installed = root / name
        self.assertFalse(installed.is_symlink(), f"{installed} must survive source removal")
        self.assertEqual((installed / "SKILL.md").read_bytes(),
                         (self.source / ".agent-skills" / name / "SKILL.md").read_bytes())
        if name != "jeo-skill":
            self.assertEqual((installed / "references/evidence.txt").read_text(), f"{name} nested payload\n")

    def snapshot(self):
        return {str(path.relative_to(self.work)): ("link", os.readlink(path)) if path.is_symlink()
                else ("file", path.read_bytes()) if path.is_file() else ("directory",)
                for path in self.work.rglob("*")}

    def test_doctor_bounds_a_hung_node_version_check(self):
        node = self.bin / "node"
        node.unlink()
        node.write_text(f"#!{sys.executable}\nimport time\ntime.sleep(60)\n")
        node.chmod(0o700)
        result = self.cli("doctor")
        self.assertEqual(result.returncode, 1, result.stdout)
        report = json.loads(result.stdout)
        self.assertFalse(report["ok"])
        self.assertIn("timed out", " ".join(report["errors"]))
        self.assertNotIn("Traceback", result.stdout)

    def test_search_limit_rejects_negative_and_honors_boundaries(self):
        result = self.cli("search", "fixture", "--limit", "-1", "--json")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("--limit must be non-negative", result.stdout)
        for limit, expected in ((0, []), (1, ["alpha"]),
                                (3, ["alpha", "beta", "jeo-skill"]),
                                (10, ["alpha", "beta", "jeo-skill"])):
            with self.subTest(limit=limit):
                result = self.cli("search", "fixture", "--limit", str(limit), "--json")
                self.successful(result)
                self.assertEqual([row["name"] for row in json.loads(result.stdout)], expected)

    def test_doctor_checks_installer_prerequisites(self):
        # Restrict PATH to fixture tools so host executables cannot mask omissions.
        env = {"PATH": str(self.bin)}
        npx = self.bin / "npx"
        node = self.bin / "node"
        node.unlink()
        for version, exit_code, supported in (("v22.19.9", 0, False),
                                               ("v22.20.0", 0, True),
                                               ("v24.0.0", 0, True),
                                               ("garbage", 0, False),
                                               ("v24.0.0", 1, False)):
            with self.subTest(version=version, exit_code=exit_code):
                node.write_text(f"#!/bin/sh\nprintf '%s\\n' '{version}'\nexit {exit_code}\n")
                node.chmod(0o700)
                result = self.cli("doctor", extra_env=env)
                report = json.loads(result.stdout)
                self.assertEqual(report["ok"], supported)
                self.assertEqual(result.returncode, 0 if supported else 1)
                if not supported:
                    self.assertIn("22.20", " ".join(report["errors"]))
                    before = self.snapshot()
                    result = self.cli("install", "alpha", "--source", str(self.source),
                                      "--yes", extra_env=env)
                    self.assertEqual(result.returncode, 1, result.stdout)
                    self.assertIn("22.20", result.stdout)
                    self.assertEqual(self.snapshot(), before)
        node.unlink()
        result = self.cli("doctor", extra_env=env)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("node", " ".join(json.loads(result.stdout)["errors"]).lower())
        npx.unlink()
        result = self.cli("doctor", extra_env=env)
        report = json.loads(result.stdout)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertFalse(report["ok"])
        self.assertIsNone(report["npx"])
        self.assertIn("npx", " ".join(report["errors"]))
        # Browsing still needs only Python, even when installer tooling is absent.
        self.successful(self.cli("list", "--json", extra_env=env))

    def test_explicit_catalog_errors_never_fall_back_to_checkout(self):
        missing = self.work / "missing-catalog.json"
        invalid = self.work / "invalid-catalog.json"
        invalid.write_text("not JSON")
        commands = (("categories", "--json"), ("list", "--json"),
                    ("search", "alpha", "--json"), ("related", "alpha", "--json"),
                    ("doctor",), ("install", "alpha", "--dry-run"))
        for path in (missing, self.work, invalid):
            for command in commands:
                with self.subTest(path=path.name, command=command):
                    before = self.snapshot()
                    result = self.cli(*command, extra_env={"JEO_SKILLS_CATALOG": str(path)})
                    self.assertNotEqual(result.returncode, 0, result.stdout)
                    self.assertIn("Cannot read catalog", result.stdout)
                    self.assertIn(str(path), result.stdout)
                    self.assertNotIn("Traceback", result.stdout)
                    self.assertEqual(self.snapshot(), before)

    def test_explicit_catalog_is_used_by_browse_and_doctor(self):
        result = self.cli("list", "--json")
        self.successful(result)
        self.assertEqual([row["name"] for row in json.loads(result.stdout)],
                         ["alpha", "beta", "jeo-skill"])
        result = self.cli("doctor")
        self.successful(result)
        self.assertEqual(json.loads(result.stdout)["catalog"], str(self.catalog.resolve()))

    def test_shared_aliases_materialize_copied_skills_in_requested_scope(self):
        for alias in ("jeopi", "jeo", "omp"):
            for global_install in (False, True):
                with self.subTest(alias=alias, global_install=global_install):
                    args = ["install", "alpha", "--agent", alias, "--yes", "--source", str(self.source)]
                    if global_install:
                        args.append("--global")
                    self.successful(self.cli(*args))
                    base = self.home if global_install else self.project
                    self.assert_skill(base / ".agents/skills", "alpha")
                    shutil.rmtree(base / ".agents/skills/alpha")
                    other = self.project if global_install else self.home
                    self.assertFalse((other / ".agents/skills/alpha").exists())

    def test_selected_nested_assets_are_independent_copies(self):
        result = self.cli("install", "alpha", "--agent", "universal", "--yes", "--source", str(self.source))
        self.successful(result)
        self.assert_skill(self.project / ".agents/skills", "alpha")

    def test_project_bootstrap_never_executes_stale_global_router(self):
        stale = self.home / ".agents/skills/jeo-skill/scripts/jeo-skill.py"
        stale.parent.mkdir(parents=True)
        stale.write_text("raise SystemExit('STALE GLOBAL ROUTER EXECUTED')\n")
        result = self.bootstrap(INSTALL_GLOBAL="false", JEO_SKILLS_AGENT="universal",
                                JEO_SKILLS_SELECTION="bundle", JEO_SKILLS_BUNDLE="pair")
        self.successful(result)
        for name in ("alpha", "beta"):
            self.assert_skill(self.project / ".agents/skills", name)
        self.assertEqual(stale.read_text(), "raise SystemExit('STALE GLOBAL ROUTER EXECUTED')\n")

    def test_global_bootstrap_upgrades_legacy_shared_router_and_keeps_cli_usable(self):
        shared = self.home / ".agents/skills"
        native = self.home / ".gjc/agent/skills"
        router = shared / "jeo-skill/scripts/jeo-skill.py"
        router.parent.mkdir(parents=True)
        (router.parent.parent / "SKILL.md").write_text(
            "---\nname: jeo-skill\ndescription: legacy standalone router\n---\nLegacy router\n")
        router.write_text(
            "#!/usr/bin/env python3\n"
            "import argparse\n"
            "parser = argparse.ArgumentParser(description='Legacy standalone router')\n"
            "parser.add_argument('--version', action='version', version='legacy')\n"
            "parser.parse_args()\n")
        router.chmod(0o700)
        link = self.home / ".local/bin/jeo-skill"
        link.parent.mkdir(parents=True)
        link.symlink_to(router)
        for root in (shared, native):
            old = root / "alpha"
            old.mkdir(parents=True)
            (old / "SKILL.md").write_text(
                "---\nname: alpha\ndescription: legacy skill\n---\nOld alpha payload\n")
        preserved = ((shared / "shared-private", "shared private skill\n"),
                     (native / "native-private", "native private skill\n"))
        for directory, content in preserved:
            directory.mkdir()
            (directory / "SKILL.md").write_text(content)

        self.successful(self.bootstrap(INSTALL_GLOBAL="true", JEO_SKILLS_AGENT="gjc",
                                       JEO_SKILLS_SELECTION="bundle", JEO_SKILLS_BUNDLE="pair"))

        for root in (shared, native):
            for name in ("jeo-skill", "alpha", "beta"):
                self.assert_skill(root, name)
            for script in ("jeo-skill.py", "install_support.py"):
                self.assertEqual((root / "jeo-skill/scripts" / script).read_bytes(),
                                 (self.source / ".agent-skills/jeo-skill/scripts" / script).read_bytes())
        self.assertTrue(link.is_symlink())
        self.assertEqual(link.resolve(), router.resolve())

        # Exercise the installed executable, not the checkout CLI: aliases and its
        # newly introduced helper must work through the original shared symlink.
        self.successful(self.execute([str(link), "install", "alpha", "--agent", "agy",
                                      "--global", "--yes", "--source", str(self.source)]))
        cli_native = self.home / ".gemini/antigravity-cli/skills"
        self.assert_skill(cli_native, "alpha")
        self.assertFalse((cli_native / "beta").exists())
        self.assertTrue(link.is_symlink())
        self.assertEqual(link.resolve(), router.resolve())
        for directory, content in preserved:
            self.assertEqual((directory / "SKILL.md").read_text(), content)
        self.assertFalse((native / "shared-private").exists())
        self.assertFalse((shared / "native-private").exists())

    def test_successful_transport_without_output_is_not_success(self):
        result = self.cli("install", "alpha", "--agent", "universal", "--yes", "--source", str(self.source),
                          extra_env={"TRANSPORT_NO_OUTPUT": "1"})
        self.assertNotEqual(result.returncode, 0, result.stdout)

    def test_transport_failure_is_surfaced_without_materialization(self):
        result = self.cli("install", "alpha", "--agent", "universal", "--yes", "--source", str(self.source),
                          extra_env={"TRANSPORT_FAILURE": "1"})
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("23", result.stdout)
        self.assertFalse((self.project / ".agents").exists())

    def test_dry_run_changes_no_files(self):
        before = self.snapshot()
        self.successful(self.cli("install", "alpha", "--agent", "universal", "--yes", "--source", str(self.source), "--dry-run"))
        self.assertEqual(self.snapshot(), before)

    def aside_account(self, home, account):
        skills = home / "u" / account / "skills"
        skills.mkdir(parents=True)
        return skills

    def aside_install(self, aside_home, *args):
        return self.cli("install", "alpha", "--agent", "aside", "--global", "--yes",
                        "--source", str(self.source), "--aside-home", str(aside_home), *args)

    def test_bootstrap_selection_preserves_custom_source_and_scope(self):
        cases = (("bundle", {"JEO_SKILLS_BUNDLE": "pair"}),
                 ("category", {"JEO_SKILLS_CATEGORY": "engineering"}),
                 ("all", {}))
        for selection, options in cases:
            for global_install in (False, True):
                with self.subTest(selection=selection, global_install=global_install):
                    self.successful(self.bootstrap(
                        JEO_SKILLS_AGENT="jeopi", INSTALL_GLOBAL=str(global_install).lower(),
                        JEO_SKILLS_SELECTION=selection, **options))
                    base = self.home if global_install else self.project
                    for name in ("jeo-skill", "alpha", "beta"):
                        self.assert_skill(base / ".agents/skills", name)
                    shutil.rmtree(base / ".agents")
                    link = self.home / ".local/bin/jeo-skill"
                    if link.is_symlink():
                        link.unlink()

    def test_direct_all_materializes_every_catalog_skill(self):
        self.successful(self.cli("install", "--all", "--agent", "universal", "--yes", "--source", str(self.source)))
        for name in ("jeo-skill", "alpha", "beta"):
            self.assert_skill(self.project / ".agents/skills", name)

    def test_bootstrap_dry_run_changes_no_files(self):
        before = self.snapshot()
        self.successful(self.bootstrap(JEO_SKILLS_AGENT="jeopi", INSTALL_GLOBAL="true",
                                       JEO_SKILLS_SELECTION="bundle", JEO_SKILLS_BUNDLE="pair",
                                       JEO_SKILLS_DRY_RUN="true"))
        self.assertEqual(self.snapshot(), before)

    def test_documented_upgrade_previews_never_install_or_invoke_transport(self):
        self.project = self.source
        shutil.copy2(ROOT / "install.sh", self.project / "install.sh")
        (self.bin / "npx").write_text(
            f"#!{sys.executable}\n"
            "import os\n"
            "with open(os.path.join(os.environ['HOME'], 'npx-calls'), 'a') as calls:\n"
            "    calls.write('invoked\\n')\n" + NPX)
        cases = ((".agent-skills/jeo-skill/SKILL.md", "### Upgrade from Old PATH-Based Router"),
                 ("setup-all-skills-prompt.md", "**Upgrade note:**"))
        for document, heading in cases:
            with self.subTest(document=document):
                section = (ROOT / document).read_text().split(heading, 1)[1]
                block = section.split("```bash\n", 1)[1].split("```", 1)[0]
                # The first installer command is the preview; navigation is
                # supplied by the isolated checkout used as the working directory.
                preview = next(line for line in block.splitlines()
                               if "./install.sh" in line and not line.lstrip().startswith("#"))
                before = self.snapshot()
                result = self.execute(["/bin/bash", "-c", preview])
                self.successful(result)
                self.assertEqual(self.snapshot(), before)
                self.assertIn("Dry run:", result.stdout)

    def test_documented_runtime_projections_preview_and_apply_exact_mode_selection(self):
        guide = (ROOT / "setup-all-skills-prompt.md").read_text()
        headings = ("### Step 4B — Materialize skills for GJC",
                    "#### Antigravity CLI (agy)", "#### Antigravity IDE (desktop editor)")
        blocks = [guide.split(heading, 1)[1].split("```bash\n", 1)[1].split("```", 1)[0]
                  for heading in headings]
        # The docs fetch the public catalog source; serve that one URL from the
        # fixture at the transport boundary without rewriting the shell examples.
        (self.bin / "npx").write_text(
            f"#!{sys.executable}\nimport os, sys\n"
            "if sys.argv[1:5] == ['--yes', 'skills@1.7.0', 'add', "
            "'https://github.com/akillness/jeo-skills']:\n"
            "    sys.argv[4] = os.environ['JEO_SKILLS_SOURCE']\n" + NPX)
        for runtime in ("gjc", "agy", "antigravity"):
            executable = self.bin / runtime
            executable.write_text("#!/bin/sh\nexit 0\n")
            executable.chmod(0o700)
        catalog = json.loads(self.catalog.read_text())
        catalog["bundles"]["starter"] = ["jeo-skill", "alpha"]
        self.catalog.write_text(json.dumps(catalog))
        cases = (("minimal", ["jeo-skill"]),
                 ("core", ["jeo-skill", "alpha"]),
                 ("full", ["jeo-skill", "alpha", "beta"]))
        for mode, selected in cases:
            with self.subTest(mode=mode):
                home = self.home / mode
                shared = home / ".agents/skills"
                shutil.copytree(self.source / ".agent-skills/jeo-skill", shared / "jeo-skill")
                result = self.execute(["/bin/bash", "-c", "\n".join(blocks)], extra_env={
                    "HOME": str(home), "USER_HOME": str(home), "SKILLS_ROOT": str(shared),
                    "ASIDE_MODE": mode,
                })
                self.successful(result)
                # Each runtime must preview and apply the same resolved selection,
                # not skip a branch or silently continue after selection failure.
                announcements = [line for line in result.stdout.splitlines() if line.startswith("Selected ")]
                self.assertEqual(announcements,
                                 [f"Selected {len(selected)} skill(s): {', '.join(selected)}"] * 6)
                for destination in (home / ".gjc/agent/skills",
                                    home / ".gemini/antigravity-cli/skills",
                                    home / ".gemini/config/skills"):
                    self.assertEqual({path.name for path in destination.iterdir()}, set(selected))
                    for name in selected:
                        self.assert_skill(destination, name)

    def test_bootstrap_missing_router_does_not_fall_back_to_global(self):
        stale = self.home / ".agents/skills/jeo-skill/scripts/jeo-skill.py"
        stale.parent.mkdir(parents=True)
        stale.write_text("raise SystemExit(0)\n")
        before = self.snapshot()
        result = self.bootstrap(INSTALL_GLOBAL="false", JEO_SKILLS_AGENT="universal",
                                JEO_SKILLS_SELECTION="router", TRANSPORT_NO_OUTPUT="1")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_agy_cli_global_install_preserves_existing_ide_symlink(self):
        ide = self.home / ".gemini/config/skills"
        ide.mkdir(parents=True)
        (ide / "keep.txt").write_text("IDE-owned skill\n")
        legacy = self.home / ".gemini/antigravity/skills"
        legacy.parent.mkdir()
        legacy.symlink_to(ide, target_is_directory=True)
        self.successful(self.cli("install", "alpha", "--agent", "agy", "--global", "--yes", "--source", str(self.source)))
        self.assert_skill(self.home / ".gemini/antigravity-cli/skills", "alpha")
        self.assertTrue(legacy.is_symlink())
        self.assertEqual((ide / "keep.txt").read_text(), "IDE-owned skill\n")
        self.assertFalse((ide / "alpha").exists())

    def test_agy_project_install_is_project_local(self):
        self.successful(self.cli("install", "alpha", "--agent", "agy", "--yes", "--source", str(self.source)))
        self.assert_skill(self.project / ".agents/skills", "alpha")
        self.assertFalse((self.home / ".gemini").exists())

    def test_explicit_antigravity_remains_distinct_from_cli(self):
        self.successful(self.cli("install", "alpha", "--agent", "antigravity", "--global", "--yes", "--source", str(self.source)))
        self.assert_skill(self.home / ".gemini/config/skills", "alpha")
        self.assertFalse((self.home / ".gemini/antigravity-cli").exists())

    def test_aside_single_account_initializes_user_skills_and_preserves_builtin(self):
        aside = self.work / "aside home"
        skills = self.aside_account(aside, "only")
        (skills / "builtin").mkdir()
        (skills / "builtin/keep.txt").write_text("builtin stays\n")
        # Account metadata is not needed to discover the already-existing account.
        (aside / "accounts.json").write_text("not JSON; installer must not read credentials")
        self.successful(self.aside_install(aside))
        self.assert_skill(skills / "user", "alpha")
        self.assert_skill(self.home / ".agents/skills", "alpha")
        self.assertEqual((skills / "builtin/keep.txt").read_text(), "builtin stays\n")
        self.assertEqual((aside / "accounts.json").read_text(), "not JSON; installer must not read credentials")

    def test_aside_account_selection_preserves_unrelated_skills_and_is_repeatable(self):
        aside = self.work / "aside"
        chosen = self.aside_account(aside, "chosen")
        other = self.aside_account(aside, "other")
        (chosen / "user/private").mkdir(parents=True)
        (chosen / "user/private/SKILL.md").write_text("user-authored private skill\n")
        # A host skill outside this selection must never leak into the account.
        host = self.home / ".agents/skills/unselected"
        host.mkdir(parents=True)
        (host / "SKILL.md").write_text("unselected host skill\n")
        self.successful(self.aside_install(aside, "--aside-account", "chosen"))
        self.assert_skill(chosen / "user", "alpha")
        self.assertEqual((chosen / "user/private/SKILL.md").read_text(), "user-authored private skill\n")
        self.assertFalse((chosen / "user/unselected").exists())
        self.assertFalse((other / "user").exists())
        before = self.snapshot()
        self.successful(self.aside_install(aside, "--aside-account", "chosen"))
        self.assertEqual(self.snapshot(), before)

    def test_aside_ambiguous_and_missing_accounts_fail_before_writes(self):
        for mode in ("missing", "ambiguous", "unknown", "traversal"):
            with self.subTest(mode=mode):
                aside = self.work / ("aside-" + mode)
                args = []
                if mode != "missing":
                    self.aside_account(aside, "first")
                if mode == "ambiguous":
                    self.aside_account(aside, "second")
                elif mode == "unknown":
                    args = ["--aside-account", "absent"]
                elif mode == "traversal":
                    args = ["--aside-account", "../first"]
                before = self.snapshot()
                result = self.aside_install(aside, *args)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(self.snapshot(), before)

    def test_aside_project_scope_is_rejected_without_writes(self):
        aside = self.work / "aside"
        self.aside_account(aside, "only")
        before = self.snapshot()
        result = self.cli("install", "alpha", "--agent", "aside", "--yes", "--source", str(self.source), "--aside-home", str(aside))
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_aside_dry_run_never_initializes_user_directory(self):
        aside = self.work / "aside"
        self.aside_account(aside, "only")
        before = self.snapshot()
        self.successful(self.aside_install(aside, "--dry-run"))
        self.assertEqual(self.snapshot(), before)

    def test_aside_symlink_boundaries_are_rejected_without_mutation(self):
        for boundary in ("home", "account", "user", "skill", "resource", "dangling-skill"):
            with self.subTest(boundary=boundary):
                aside = self.work / ("aside-" + boundary)
                outside = self.work / ("outside-" + boundary)
                outside.mkdir()
                (outside / "sentinel").write_text("untouched\n")
                if boundary == "home":
                    self.aside_account(outside, "only")
                    aside.symlink_to(outside, target_is_directory=True)
                else:
                    skills = self.aside_account(aside, "only")
                    if boundary == "account":
                        shutil.rmtree(aside / "u/only")
                        (outside / "skills").mkdir()
                        (aside / "u/only").symlink_to(outside, target_is_directory=True)
                    elif boundary == "user":
                        (skills / "user").symlink_to(outside, target_is_directory=True)
                    else:
                        (skills / "user").mkdir()
                        target = skills / "user/alpha"
                        if boundary == "resource":
                            target.mkdir()
                            target = target / "references"
                        destination = outside / "missing" if boundary == "dangling-skill" else outside
                        target.symlink_to(destination, target_is_directory=True)
                before = self.snapshot()
                result = self.aside_install(aside, "--aside-account", "only")
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(self.snapshot(), before)

    def test_bootstrap_aside_options_reach_selected_account(self):
        aside = self.work / "aside"
        chosen = self.aside_account(aside, "chosen")
        other = self.aside_account(aside, "other")
        self.successful(self.bootstrap(JEO_SKILLS_AGENT="aside", INSTALL_GLOBAL="true",
                                       JEO_SKILLS_SELECTION="bundle", JEO_SKILLS_BUNDLE="pair",
                                       JEO_SKILLS_ASIDE_HOME=str(aside), JEO_SKILLS_ASIDE_ACCOUNT="chosen"))
        for name in ("jeo-skill", "alpha", "beta"):
            self.assert_skill(chosen / "user", name)
        self.assertFalse((other / "user").exists())

    def test_gjc_materializes_native_skills_in_both_scopes(self):
        for global_install in (False, True):
            with self.subTest(global_install=global_install):
                native = self.home / ".gjc/agent/skills" if global_install else self.project / ".gjc/skills"
                args = ["install", "alpha", "--agent", "gjc", "--yes", "--source", str(self.source)]
                if global_install:
                    args.append("--global")
                self.successful(self.cli(*args))
                self.assert_skill(native, "alpha")
                shutil.rmtree(native / "alpha")

    def test_gjc_preserves_unselected_native_skills(self):
        native = self.project / ".gjc/skills"
        private = native / "private"
        private.mkdir(parents=True)
        (private / "SKILL.md").write_text("native private skill\n")
        self.successful(self.cli("install", "alpha", "--agent", "gjc", "--yes", "--source", str(self.source)))
        self.assert_skill(native, "alpha")
        self.assertEqual((private / "SKILL.md").read_text(), "native private skill\n")

    def test_aside_failed_transport_never_mirrors_stale_host_skill(self):
        aside = self.work / "aside"
        skills = self.aside_account(aside, "only")
        host = self.home / ".agents/skills/alpha"
        host.mkdir(parents=True)
        (host / "SKILL.md").write_text("stale host skill\n")
        before = self.snapshot()
        result = self.cli("install", "alpha", "--agent", "aside", "--global", "--yes",
                          "--source", str(self.source), "--aside-home", str(aside),
                          extra_env={"TRANSPORT_FAILURE": "1"})
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse((skills / "user").exists())
        self.assertEqual(self.snapshot(), before)

    def test_gjc_global_config_name_override_and_precedence(self):
        cases = (({"PI_CONFIG_DIR": ".pi-fixture"}, ".pi-fixture"),
                 ({"GJC_CONFIG_DIR": ".gjc-fixture", "PI_CONFIG_DIR": ".pi-ignored"}, ".gjc-fixture"))
        for environment, config in cases:
            with self.subTest(environment=environment):
                self.successful(self.cli("install", "alpha", "--agent", "gjc", "--global", "--yes",
                                         "--source", str(self.source), extra_env=environment))
                native = self.home / config / "agent/skills"
                self.assert_skill(native, "alpha")
                self.assertFalse((self.home / ".gjc/agent/skills/alpha").exists())
                self.assertFalse((self.home / ".pi-ignored").exists())
                shutil.rmtree(native / "alpha")

    def sync_entrypoint(self):
        destination = self.source / "scripts/sync-aside-skills.py"
        destination.parent.mkdir(exist_ok=True)
        shutil.copy2(ROOT / "scripts/sync-aside-skills.py", destination)
        return [sys.executable, str(destination)]

    def test_aside_sync_check_detects_drift_without_writes(self):
        aside = self.work / "aside"
        skills = self.aside_account(aside, "chosen")
        project_skills = self.source / ".agents/skills"
        project_skills.mkdir(parents=True)
        command = self.sync_entrypoint() + ["alpha", "--aside-home", str(aside), "--aside-account", "chosen"]
        before = self.snapshot()
        missing = self.execute(command + ["--check"])
        self.assertNotEqual(missing.returncode, 0, missing.stdout)
        self.assertEqual(self.snapshot(), before)
        self.successful(self.execute(command))
        for root in (self.home / ".agents/skills", skills / "user", project_skills):
            self.assert_skill(root, "alpha")
        before = self.snapshot()
        self.successful(self.execute(command + ["--check"]))
        self.assertEqual(self.snapshot(), before)
        (skills / "user/alpha/references/evidence.txt").write_text("drifted nested resource\n")
        before = self.snapshot()
        drifted = self.execute(command + ["--check"])
        self.assertNotEqual(drifted.returncode, 0, drifted.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_aside_sync_preflights_every_selected_source(self):
        aside = self.work / "aside"
        self.aside_account(aside, "chosen")
        command = self.sync_entrypoint() + ["alpha", "beta", "--aside-home", str(aside)]
        external = self.work / "external-source"
        external.mkdir()
        (external / "sentinel").write_text("unchanged\n")
        (self.source / ".agent-skills/beta/references/escape").symlink_to(external, target_is_directory=True)
        before = self.snapshot()
        result = self.execute(command)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_aside_sync_explicit_home_does_not_write_process_home(self):
        aside = self.work / "aside"
        skills = self.aside_account(aside, "chosen")
        explicit_home = self.work / "explicit-home"
        explicit_home.mkdir()
        command = self.sync_entrypoint() + ["alpha", "--home", str(explicit_home), "--aside-home", str(aside)]
        self.successful(self.execute(command))
        self.assert_skill(explicit_home / ".agents/skills", "alpha")
        self.assert_skill(skills / "user", "alpha")
        self.assertFalse((self.home / ".agents").exists())

    def test_switching_global_runtime_keeps_shared_cli_usable(self):
        for agent in ("gjc", "agy"):
            self.successful(self.bootstrap(JEO_SKILLS_AGENT=agent, INSTALL_GLOBAL="true",
                                           JEO_SKILLS_SELECTION="router"))
        # Removing native router projections must not strand the shared command.
        for root in (self.home / ".gjc/agent/skills", self.home / ".gemini/antigravity-cli/skills"):
            shutil.rmtree(root / "jeo-skill")
        command = self.home / ".local/bin/jeo-skill"
        self.successful(self.execute([str(command), "install", "beta", "--agent", "jeopi",
                                      "--global", "--yes", "--source", str(self.source)]))
        self.assert_skill(self.home / ".agents/skills", "beta")

    def test_local_source_catalog_controls_bundle_membership(self):
        catalog = json.loads(self.catalog.read_text())
        catalog["bundles"]["source-pair"] = ["beta"]
        (self.source / ".agent-skills/skills.json").write_text(json.dumps(catalog))
        self.successful(self.cli("install", "--bundle", "source-pair", "--agent", "universal", "--yes",
                                 "--source", str(self.source), extra_env={"JEO_SKILLS_CATALOG": ""}))
        self.assert_skill(self.project / ".agents/skills", "beta")
        self.assertFalse((self.project / ".agents/skills/alpha").exists())
        self.assertFalse((self.project / ".agents/skills/jeo-skill").exists())

    def test_explicit_invalid_catalog_never_falls_back(self):
        for case, content in (("missing", None), ("malformed", "{"), ("invalid-schema", "{}")):
            with self.subTest(case=case):
                catalog = self.work / (case + ".json")
                if content is not None:
                    catalog.write_text(content)
                before = self.snapshot()
                result = self.cli("install", "jeo-skill", "--agent", "universal", "--yes",
                                  "--source", str(self.source), extra_env={"JEO_SKILLS_CATALOG": str(catalog)})
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(self.snapshot(), before)

    def test_remote_all_without_source_catalog_fails_even_in_dry_run(self):
        before = self.snapshot()
        result = self.cli("install", "--all", "--agent", "universal", "--yes", "--dry-run",
                          "--source", "https://example.invalid/other-skills",
                          extra_env={"JEO_SKILLS_CATALOG": ""})
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("JEO_SKILLS_CATALOG", result.stdout)
        self.assertEqual(self.snapshot(), before)


    def test_optional_setup_does_not_fetch_or_install_without_opt_in(self):
        installer = self.work / "install.sh"
        shutil.copyfile(ROOT / "install.sh", installer)
        curl_log = self.work / "curl.log"
        curl = self.bin / "curl"
        curl.write_text(f"#!/bin/sh\nprintf '%s\\n' \"$*\" >> '{curl_log}'\nexit 91\n")
        curl.chmod(0o700)
        for mode in (None, "skip"):
            with self.subTest(mode=mode):
                curl_log.unlink(missing_ok=True)
                options = {} if mode is None else {"JEO_SKILLS_JEV": mode}
                result = self.execute(["/bin/bash", str(installer)], options)
                self.successful(result)
                self.assertFalse(curl_log.exists(), result.stdout)
                self.assertFalse((self.home / ".agents/jev").exists())
                self.assertFalse((self.home / ".agents/rules/jev-control-plane.md").exists())

    def test_project_scope_rejects_explicit_jev_before_any_installation(self):
        for mode in ("api", "local", "ollama", "lmstudio"):
            with self.subTest(mode=mode):
                before = self.snapshot()
                result = self.bootstrap(INSTALL_GLOBAL="false", JEO_SKILLS_JEV=mode,
                                        JEV_API_KEY="fixture-secret")
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(self.snapshot(), before)

    def test_project_scope_unset_and_skip_remain_catalog_only(self):
        for mode in (None, "skip"):
            with self.subTest(mode=mode):
                options = {} if mode is None else {"JEO_SKILLS_JEV": mode}
                self.successful(self.bootstrap(INSTALL_GLOBAL="false", **options))
                self.assert_skill(self.project / ".agents/skills", "jeo-skill")
                self.assertFalse((self.home / ".agents/jev").exists())
                self.assertFalse((self.home / ".agents/rules/jev-control-plane.md").exists())




    def test_remote_jev_setup_is_downloaded_privately_executed_and_cleaned(self):
        installer = self.work / "install.sh"
        shutil.copyfile(ROOT / "install.sh", installer)
        record = self.work / "download.json"
        curl = self.bin / "curl"
        curl.write_text(f"#!{sys.executable}\n" +
                        "import json, os, pathlib, sys\n"
                        "args = sys.argv[1:]\n"
                        "destination = pathlib.Path(args[args.index('-o') + 1])\n"
                        "parent = destination.parent.stat()\n"
                        "private_dir = parent.st_uid == os.getuid() and parent.st_mode & 0o077 == 0\n"
                        "private_file = (destination.is_file() and not destination.is_symlink()\n"
                        "                and destination.stat().st_uid == os.getuid()\n"
                        "                and destination.stat().st_mode & 0o077 == 0)\n"
                        f"pathlib.Path({str(record)!r}).write_text(json.dumps({{'path': str(destination), 'private': private_dir or private_file}}))\n"
                        "if not (private_dir or private_file): raise SystemExit(91)\n"
                        "destination.write_text('#!/bin/bash\\nprintf remote-setup-executed > \"$HOME/remote-setup.fixture\"\\n')\n")
        curl.chmod(0o700)
        result = self.execute(["/bin/bash", str(installer)],
                              {"JEO_SKILLS_JEV": "api", "JEV_API_KEY": "fixture-secret"})
        self.successful(result)
        download = json.loads(record.read_text())
        self.assertTrue(download["private"], result.stdout)
        self.assertEqual((self.home / "remote-setup.fixture").read_text(), "remote-setup-executed")
        self.assertFalse(Path(download["path"]).exists())
        if Path(download["path"]).parent != self.work:
            self.assertFalse(Path(download["path"]).parent.exists())


if __name__ == "__main__":
    unittest.main()
