#!/usr/bin/env python3
"""Hermetic acceptance tests for scripts/setup-workspace.py.

Every external tool (zg, mex-agent, rtk, semble, graphify, crontab, host CLI,
open-ontologies) and every sibling skill script is a controlled fake that appends
its argv to a call log. The workspace helper's orchestration, rule/marker writing,
config generation, veto handling and idempotence are real.
Run: python3 scripts/test_setup_workspace.py -v
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts/setup-workspace.py"
BIN_TOOLS = ("zg", "mex-agent", "rtk", "semble", "graphify", "crontab", "claude", "open-ontologies", "cargo")
RULE = "jeo-workflows.md"


def write_exec(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(0o755)


class Sandbox:
    """Temp HOME, project, fake skills root and fake PATH tools sharing one call log."""

    def __init__(self, tools: tuple[str, ...] = BIN_TOOLS, skills: bool = True, jev: bool = False) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name).resolve()
        self.home, self.project = base / "home", base / "proj"
        self.skills, self.bin = base / "skills", base / "bin"
        self.log = base / "calls.log"
        for d in (self.home, self.project, self.bin):
            d.mkdir()
        self.log.write_text("", encoding="utf-8")
        for tool in tools:
            if tool == "zg":
                body = (f'#!/bin/sh\necho "{tool} $*" >> "{self.log}"\n'
                        'if [ "$1" = version ]; then echo 0.2.2; exit 0; fi\n'
                        'exit 0\n')
            else:
                body = f'#!/bin/sh\necho "{tool} $*" >> "{self.log}"\nexit 0\n'
            write_exec(self.bin / tool, body)
        if skills:
            self._skills()
        if jev:
            (self.home / ".agents/jev").mkdir(parents=True)
            (self.home / ".agents/jev/agents.json").write_text(
                json.dumps({"codex": {"profile": "codex", "native": "adapter", "scope": "user"}}), encoding="utf-8")

    def _skills(self) -> None:
        sh = lambda name: f'#!/bin/sh\necho "{name} $*" >> "{self.log}"\n'
        py = lambda name: ('#!/usr/bin/env python3\nimport sys\n'
                           f'open({str(self.log)!r}, "a").write("{name} " + " ".join(sys.argv[1:]) + "\\n")\n')
        write_exec(self.skills / "mex/scripts/install.sh", sh("mex-install"))
        write_exec(self.skills / "openspace/scripts/install-openspace.sh", sh("openspace-install"))
        write_exec(self.skills / "openspace/scripts/route-hooks.py", py("route-hooks"))
        write_exec(self.skills / "open-ontologies/scripts/smoke.py", py("oo-smoke"))
        write_exec(self.skills / "harness2/scripts/preflight.py", py("h2-preflight"))
        write_exec(self.skills / "repo-knowledge-wiki/scripts/bootstrap.py", py("knowledge-bootstrap"))
        setup = (py("brain-setup")
                 + 'cfg = sys.argv[sys.argv.index("--config") + 1]\n'
                   f'open({str(self.log)!r}, "a").write("CONFIG " + open(cfg).read().replace("\\n", " ") + "\\n")\n')
        write_exec(self.skills / "obsidian-second-brain/scripts/setup.py", setup)

    def run(self, *extra: str, env: dict | None = None, project: Path | None = None):
        environ = {"PATH": f"{self.bin}:/usr/bin:/bin", "HOME": str(self.home), "TMPDIR": self.tmp.name}
        environ.update(env or {})
        cmd = [sys.executable, str(HELPER), "--home", str(self.home), "--project", str(project or self.project),
               "--skills-root", str(self.skills), "--json", *extra]
        proc = subprocess.run(cmd, env=environ, capture_output=True, text=True, timeout=120)
        report = json.loads(proc.stdout) if proc.stdout.strip().startswith("{") else None
        return proc, report

    def calls(self) -> list[str]:
        return [line for line in self.log.read_text(encoding="utf-8").splitlines() if line]

    def called(self, prefix: str) -> bool:
        return any(line.startswith(prefix) for line in self.calls())

    def cleanup(self) -> None:
        self.tmp.cleanup()


class WorkspaceSetupTests(unittest.TestCase):
    def sandbox(self, **kwargs) -> Sandbox:
        box = Sandbox(**kwargs)
        self.addCleanup(box.cleanup)
        return box

    def test_full_activation_runs_every_workflow_once(self):
        box = self.sandbox(jev=True)
        subprocess.run(["git", "init", "-q"], cwd=box.project, check=True)
        (box.project / ".mex").mkdir()
        fake_jeo_code = Path(box.tmp.name).resolve() / "jeo-code"
        mem_cli = fake_jeo_code / "packages/jeo-mem/src/cli.ts"
        mem_cli.parent.mkdir(parents=True, exist_ok=True)
        mem_cli.write_text("#!/usr/bin/env bun\n", encoding="utf-8")
        write_exec(
            box.bin / "bun",
            f'#!/bin/sh\necho "bun $*" >> "{box.log}"\nexit 0\n',
        )
        proc, report = box.run(env={"JEO_CODE_ROOT": str(fake_jeo_code)})
        self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
        statuses = {k: v["status"] for k, v in report["steps"].items()}
        self.assertEqual(set(statuses.values()), {"ok"}, statuses)
        for prefix in ("mex-install", "knowledge-bootstrap", "zg index", "zg status --check-ready", "brain-setup",
                       "oo-smoke", "openspace-install", "route-hooks install", "rtk init -g --auto-patch",
                       f"bun {mem_cli} build --repo {box.project}"):
            self.assertTrue(box.called(prefix), f"{prefix} not called: {box.calls()}")
        self.assertEqual(os.readlink(box.home / ".local/bin/jeox"), str(mem_cli))
        self.assertFalse((box.project / ".jeo/db/jeo.db").exists())
        self.assertIn(f"mex-install {box.project} --skip-skill", box.calls())
        # zvec indexes the project with the pinned local embedding on first run only
        self.assertIn("zg index --embedding local/potion-code-16m-v2", box.calls())

    def test_jeox_skips_when_jeo_code_unavailable(self):
        box = self.sandbox()
        proc, report = box.run(env={"JEO_CODE_ROOT": "none"})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(report["steps"]["jeox"]["status"], "skipped")
        self.assertFalse((box.project / ".jeo/db/jeo.db").exists())
        self.assertFalse((box.home / ".local/bin/jeox").exists())

    def test_second_brain_config_uses_new_vault_and_bounded_budget(self):
        box = self.sandbox()
        proc, _ = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        cfg_path = box.home / ".jeo/second-brain-config.json"
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
        self.assertEqual(data["vault"], str(box.home / "vaults/jeo-second-brain"))
        self.assertNotIn("llm-wiki", json.dumps(data))
        self.assertEqual((data["max_run_usd"], data["daily_budget_usd"], data["timeout_seconds"]), (0.5, 5.0, 300))
        self.assertEqual(data["host"], "auto")
        self.assertEqual(data["model"], "auto")
        self.assertNotIn("graphify_provider", data["consent"])
        self.assertEqual(cfg_path.stat().st_mode & 0o777, 0o600)

    def test_second_brain_missing_host_model_is_pending_for_default_config(self):
        box = self.sandbox()
        setup_script = box.skills / "obsidian-second-brain/scripts/setup.py"
        setup_script.write_text(
            "#!/usr/bin/env python3\n"
            "import json\n"
            "print(json.dumps({'status': 'error', 'error': 'explicit model identifier is required'}))\n"
            "raise SystemExit(1)\n",
            encoding="utf-8",
        )
        setup_script.chmod(0o755)
        proc, report = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
        self.assertEqual(report["steps"]["second-brain"]["status"], "pending")
        self.assertIn("SECOND_BRAIN_MODEL", report["steps"]["second-brain"]["detail"])
        custom_cfg = Path(box.tmp.name) / "custom-brain.json"
        custom_cfg.write_text('{"version": 1, "model": "auto"}\n', encoding="utf-8")
        proc_custom, report_custom = box.run(env={"JEO_SECOND_BRAIN_CONFIG": str(custom_cfg)})
        self.assertEqual(proc_custom.returncode, 1)
        self.assertEqual(report_custom["steps"]["second-brain"]["status"], "failed")
    def test_existing_second_brain_config_is_never_overwritten(self):
        box = self.sandbox()
        cfg = box.home / ".jeo/second-brain-config.json"
        cfg.parent.mkdir(parents=True)
        cfg.write_text('{"vault": "/custom/vault", "keep": true}', encoding="utf-8")
        proc, _ = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(cfg.read_text(encoding="utf-8")), {"vault": "/custom/vault", "keep": True})
        self.assertIn("/custom/vault", (box.project / ".agents/rules" / RULE).read_text(encoding="utf-8"))

    def test_rules_written_globally_and_in_project_with_pointer(self):
        box = self.sandbox()
        (box.project / "AGENTS.md").write_text("# Mine\nkeep this line\n", encoding="utf-8")
        (box.project / "CLAUDE.md").write_text("# Claude anchor\n", encoding="utf-8")
        proc, _ = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        glob = (box.home / ".agents/rules" / RULE).read_text(encoding="utf-8")
        proj = (box.project / ".agents/rules" / RULE).read_text(encoding="utf-8")
        self.assertEqual(glob, proj)
        for name in ("AGENTS.md", "CLAUDE.md"):
            text = (box.project / name).read_text(encoding="utf-8")
            self.assertIn("JEO-WORKFLOWS:START", text)
            self.assertIn(f".agents/rules/{RULE}", text)
        self.assertIn("keep this line", (box.project / "AGENTS.md").read_text(encoding="utf-8"))
    def test_agy_host_gets_global_gemini_pointer_preserving_existing_rules(self):
        box = self.sandbox(tools=BIN_TOOLS + ("agy",))
        gemini = box.home / ".gemini/GEMINI.md"
        gemini.parent.mkdir()
        gemini.write_text("# RTK\nkeep rtk rules\n", encoding="utf-8")
        for _ in range(2):  # second run proves idempotence
            proc, _ = box.run()
            self.assertEqual(proc.returncode, 0, proc.stderr)
        text = gemini.read_text(encoding="utf-8")
        self.assertIn("keep rtk rules", text)
        self.assertEqual(text.count("JEO-WORKFLOWS:START"), 1)
        self.assertIn(f"~/.agents/rules/{RULE}", text)
        self.assertIn("openspace route → rtk shell → semble search → jev", text)

    def test_agy_pointer_created_when_only_agy_binary_exists(self):
        box = self.sandbox(tools=BIN_TOOLS + ("agy",))
        proc, _ = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("JEO-WORKFLOWS:START", (box.home / ".gemini/GEMINI.md").read_text(encoding="utf-8"))

    def test_no_gemini_files_without_agy(self):
        box = self.sandbox()
        proc, _ = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertFalse((box.home / ".gemini").exists())



    def test_rules_cover_all_workflows_and_enforce_order(self):
        box = self.sandbox()
        box.run()
        text = (box.home / ".agents/rules" / RULE).read_text(encoding="utf-8")
        order = [text.index(k) for k in ("**openspace**", "**rtk**", "**semble**", "**jev**")]
        self.assertEqual(order, sorted(order), "per-prompt order must be openspace, rtk, semble, jev")
        self.assertIn("only after steps 2 and 3 both ran", text)
        for needle in ("knowledge/", "knowledge-pairings.md", "second-brain", "mex-agent", "zg query", "-g 'knowledge/**' -g '!knowledge/raw/**'", "open-ontologies", "harness2", ".harness2/workspace.json"):
            self.assertIn(needle, text)

    def test_rule_files_are_always_applied_harness_rules(self):
        # jeopi injects a rule only with `alwaysApply: true` (or lists it with a description), and it parses
        # frontmatter only at the very top of the file; a marker-first file is silently inert.
        box = self.sandbox()
        box.run()
        for path in (box.home / ".agents/rules" / RULE, box.project / ".agents/rules" / RULE):
            text = path.read_text(encoding="utf-8")
            self.assertTrue(text.startswith("---\n"), f"{path}: frontmatter must be the first line")
            head = text.split("\n---\n", 1)[0]
            self.assertEqual(head.count("alwaysApply: true"), 1)
            self.assertIn("description:", head)
            self.assertLess(text.index("alwaysApply: true"), text.index("JEO-WORKFLOWS:START"))

    def test_rule_text_uses_commands_that_run(self):
        box = self.sandbox()
        box.run()
        text = (box.home / ".agents/rules" / RULE).read_text(encoding="utf-8")
        # the system python3 cannot import `openspace`; only the venv interpreter runs the router
        self.assertIn("venvs/openspace/bin/python ~/.agents/skills/openspace/scripts/route_prompt.py", text)
        self.assertNotIn("`python3 ~/.agents/skills/openspace/scripts/route_prompt.py", text)
        # an empty .mex/ has no ROUTER.md; the rule must not demand it unconditionally
        self.assertIn("when it exists", text)

    def test_legacy_rule_is_migrated_and_foreign_frontmatter_and_text_are_kept(self):
        box = self.sandbox()
        legacy = box.project / ".agents/rules" / RULE
        legacy.parent.mkdir(parents=True)
        legacy.write_text("<!-- JEO-WORKFLOWS:START -->\nold\n<!-- JEO-WORKFLOWS:END -->\n", encoding="utf-8")
        mine = box.home / ".agents/rules" / RULE
        mine.parent.mkdir(parents=True)
        mine.write_text('---\nglobs: ["src/**"]\nalwaysApply: false\nnested:\n  - keep\n---\nUSER NOTE\n\n'
                        "<!-- JEO-WORKFLOWS:START -->\nold\n<!-- JEO-WORKFLOWS:END -->\n\ntrailing text\n",
                        encoding="utf-8")
        proc, _ = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        migrated = legacy.read_text(encoding="utf-8")
        self.assertTrue(migrated.startswith("---\n"))
        self.assertNotIn("\nold\n", migrated)
        kept = mine.read_text(encoding="utf-8")
        head = kept.split("\n---\n", 1)[0]
        self.assertEqual(head.count("alwaysApply"), 1)
        self.assertIn("alwaysApply: true", head)
        for needle in ('globs: ["src/**"]', "nested:", "  - keep", "USER NOTE", "trailing text"):
            self.assertIn(needle, kept)

    def test_verify_reports_missing_inert_stale_and_ok_without_writing(self):
        box = self.sandbox()

        def states(proc_report):
            return {c["target"]: c["state"] for c in proc_report["checks"]}

        proc, report = box.run("--verify")
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(set(states(report).values()), {"missing"})
        self.assertEqual(list(box.home.rglob("*")), [], "--verify must not write")
        self.assertEqual(list(box.project.rglob("*")), [], "--verify must not write")
        self.assertEqual(box.calls(), [], "--verify must not run a tool")

        box.run()
        proc, report = box.run("--verify")
        self.assertEqual((proc.returncode, report["ok"]), (0, True), proc.stdout)
        self.assertEqual(set(states(report).values()), {"ok"})

        rule = box.project / ".agents/rules" / RULE
        good = rule.read_text(encoding="utf-8")
        rule.write_text(good.split("\n---\n", 1)[1], encoding="utf-8")  # frontmatter stripped: inert
        proc, report = box.run("--verify")
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(states(report)["project rule"], "inert")
        rule.write_text(good.replace("Workflow Rules", "OLD TITLE"), encoding="utf-8")
        proc, report = box.run("--verify")
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(states(report)["project rule"], "stale")
        rule.write_text(good.replace("alwaysApply: true", "alwaysApply: false"), encoding="utf-8")
        proc, report = box.run("--verify")
        self.assertEqual(states(report)["project rule"], "inert")
        self.assertEqual(rule.read_text(encoding="utf-8"), good.replace("alwaysApply: true", "alwaysApply: false"))

    def test_rerun_is_idempotent_and_updates_blocks_in_place(self):
        box = self.sandbox()
        (box.project / "AGENTS.md").write_text("# Mine\n", encoding="utf-8")
        box.run()
        rule = box.project / ".agents/rules" / RULE
        anchor = box.project / "AGENTS.md"
        before = (rule.read_bytes(), anchor.read_bytes(), (box.home / ".jeo/second-brain-config.json").read_bytes())
        proc, _ = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        after = (rule.read_bytes(), anchor.read_bytes(), (box.home / ".jeo/second-brain-config.json").read_bytes())
        self.assertEqual(before, after)
        self.assertEqual(anchor.read_text(encoding="utf-8").count("JEO-WORKFLOWS:START"), 1)
        # zvec: an existing index is refreshed incrementally, never re-embedded
        (box.project / ".zvec-grep").mkdir()
        box.log.write_text("", encoding="utf-8")
        box.run()
        self.assertIn("zg index", box.calls())
        self.assertNotIn("zg index --embedding local/potion-code-16m-v2", box.calls())
        # stale block content is replaced, surrounding user text kept
        text = rule.read_text(encoding="utf-8").replace("Workflow Rules", "OLD TITLE")
        rule.write_text("# user header\n\n" + text + "\n# user footer\n", encoding="utf-8")
        box.run()
        fresh = rule.read_text(encoding="utf-8")
        self.assertNotIn("OLD TITLE", fresh)
        self.assertIn("# user header", fresh)
        self.assertIn("# user footer", fresh)

    def test_unterminated_marker_fails_that_step_but_others_continue(self):
        box = self.sandbox()
        (box.project / "AGENTS.md").write_text("<!-- JEO-WORKFLOWS:START -->\nhalf written\n", encoding="utf-8")
        proc, report = box.run()
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(report["failed"], ["rules"])
        self.assertEqual(report["steps"]["mex"]["status"], "ok")
        self.assertEqual(report["steps"]["harness2"]["status"], "ok")
        self.assertEqual((box.project / "AGENTS.md").read_text(encoding="utf-8"),
                         "<!-- JEO-WORKFLOWS:START -->\nhalf written\n")

    def test_knowledge_veto_blocks_second_brain_only(self):
        for var, val in (
            ("JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS", "false"),
            ("JEO_SKILLS_APPROVE_KNOWLEDGE_DATA", "false"),
            ("JEO_SKILLS_SECOND_BRAIN", "skip"),
        ):
            with self.subTest(var=var, val=val):
                box = self.sandbox()
                proc, report = box.run(env={var: val})
                self.assertEqual(proc.returncode, 0, proc.stderr)
                self.assertEqual(report["steps"]["second-brain"]["status"], "skipped")
                self.assertFalse(box.called("brain-setup"))
                self.assertFalse((box.home / ".jeo/second-brain-config.json").exists())
                self.assertEqual(report["steps"]["mex"]["status"], "ok")

    def test_hook_vetoes_block_hook_writes_but_not_tools(self):
        box = self.sandbox()
        proc, report = box.run(env={"JEO_SKILLS_APPROVE_ALL_HOOKS_MCP": "false"})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(report["steps"]["openspace"]["status"], "skipped")
        self.assertEqual(report["steps"]["rtk-semble"]["status"], "skipped")
        self.assertFalse(box.called("route-hooks"))
        self.assertFalse(box.called("rtk init"))
        self.assertTrue(box.called("openspace-install"))

    def test_no_activate_runs_no_tool_but_writes_rules_and_manifest(self):
        box = self.sandbox()
        proc, report = box.run("--no-activate")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual([c for c in box.calls() if not c.startswith("h2-preflight")], [])
        self.assertTrue((box.project / ".agents/rules" / RULE).is_file())
        self.assertTrue((box.project / ".harness2/workspace.json").is_file())
        self.assertEqual(report["steps"]["zvec"]["status"], "skipped")
        self.assertFalse((box.home / ".jeo").exists())

    def test_missing_prerequisites_are_pending_not_failed(self):
        box = self.sandbox(tools=("claude",), skills=False)
        proc, report = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        for step in ("mex", "zvec", "second-brain", "open-ontologies", "openspace", "rtk-semble"):
            self.assertEqual(report["steps"][step]["status"], "pending", step)
        self.assertEqual(report["steps"]["rules"]["status"], "ok")
        brain = self.sandbox(tools=("claude", "zg", "mex-agent", "graphify"))  # no crontab
        _, report = brain.run(env={"PATH": str(brain.bin)})  # hide the real /usr/bin/crontab
        self.assertEqual(report["steps"]["second-brain"]["status"], "pending")
        self.assertIn("crontab", report["steps"]["second-brain"]["detail"])
        self.assertFalse(brain.called("brain-setup"))

    def test_tool_failure_is_reported_and_exit_nonzero(self):
        box = self.sandbox()
        write_exec(box.bin / "zg", f'#!/bin/sh\necho "zg $*" >> "{box.log}"\nexit 3\n')
        proc, report = box.run()
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(report["failed"], ["zvec"])
        self.assertEqual(report["steps"]["second-brain"]["status"], "ok")

    def test_zvec_version_is_checked_before_indexing(self):
        box = self.sandbox()
        proc, report = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(report["steps"]["zvec"]["status"], "ok")
        calls = box.calls()
        self.assertIn("zg version", calls)
        self.assertIn("zg index --embedding local/potion-code-16m-v2", calls)
        self.assertLess(calls.index("zg version"), calls.index("zg index --embedding local/potion-code-16m-v2"))

    def test_zvec_incompatible_versions_fail_without_indexing(self):
        for version in ("0.3.0", "0.2.1", "0.2.2-beta"):
            with self.subTest(version=version):
                box = self.sandbox()
                write_exec(box.bin / "zg", f'#!/bin/sh\necho "zg $*" >> "{box.log}"\n'
                           f'if [ "$1" = version ]; then echo {version}; exit 0; fi\nexit 0\n')
                proc, report = box.run()
                self.assertEqual(proc.returncode, 1, proc.stderr)
                self.assertEqual(report["failed"], ["zvec"])
                self.assertEqual(report["steps"]["zvec"]["status"], "failed")
                self.assertIn("zg version", box.calls())
                self.assertFalse(any(call.startswith("zg index") for call in box.calls()), box.calls())

    def test_refresh_hooks_preserve_existing_post_commit_and_do_not_duplicate(self):
        box = self.sandbox()
        subprocess.run(["git", "init", "-q"], cwd=box.project, check=True)
        hook = box.project / ".git/hooks/post-commit"
        hook.parent.mkdir(exist_ok=True)
        hook.write_text("#!/bin/sh\necho user-hook\n", encoding="utf-8")
        (box.project / ".mex").mkdir()
        for _ in range(2):
            proc, report = box.run()
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertEqual(report["steps"]["refresh"]["status"], "ok")
        text = hook.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("#!/bin/sh\n"))
        self.assertIn("echo user-hook", text)
        self.assertEqual(text.count("JEO-WORKFLOWS:START zvec refresh"), 1)
        self.assertEqual(hook.stat().st_mode & 0o111, 0o111)
        self.assertTrue(box.called("mex-agent watch"))

    def test_refresh_skips_non_shell_post_commit(self):
        box = self.sandbox()
        subprocess.run(["git", "init", "-q"], cwd=box.project, check=True)
        hook = box.project / ".git/hooks/post-commit"
        hook.parent.mkdir(exist_ok=True)
        hook.write_text("#!/usr/bin/env python3\nprint(1)\n", encoding="utf-8")
        _, report = box.run()
        self.assertIn("not a shell script", report["steps"]["refresh"]["detail"])
        self.assertEqual(hook.read_text(encoding="utf-8"), "#!/usr/bin/env python3\nprint(1)\n")

    def test_dry_run_writes_and_runs_nothing(self):
        box = self.sandbox()
        proc, report = box.run("--dry-run")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(box.calls(), [])
        self.assertEqual(sorted(p.name for p in box.project.iterdir()), [])
        self.assertEqual(sorted(p.name for p in box.home.iterdir()), [])
        self.assertNotIn("ok", {v["status"] for v in report["steps"].values()})

    def test_manifest_maps_components_and_records_status(self):
        box = self.sandbox(jev=True)
        (box.project / "scripts").mkdir()
        box.run()
        manifest = json.loads((box.project / ".harness2/workspace.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["mode"], "method")
        self.assertIn("scripts", manifest["components"]["c7_scripts"])
        self.assertEqual(manifest["components"]["c3_memory"], [])
        self.assertIn(f".agents/rules/{RULE}", manifest["components"]["c4_tool_guidance"])
        self.assertEqual(manifest["workflow_status"]["mex"], "ok")
        self.assertEqual(manifest["workflow_status"]["jev"], "ok")
        self.assertIn("on demand", manifest["benchmarks"])

    def test_jev_step_is_inert_without_jev(self):
        box = self.sandbox()
        _, report = box.run()
        self.assertEqual(report["steps"]["jev"]["status"], "skipped")
        self.assertFalse((box.home / ".agents/jev").exists())

    def test_refuses_home_as_workspace(self):
        box = self.sandbox()
        proc, report = box.run(project=box.home)
        self.assertEqual(proc.returncode, 2)
        self.assertIsNone(report)
        self.assertIn("refusing", proc.stderr)
        self.assertEqual(box.calls(), [])


class RuleSourceFrontmatterTests(unittest.TestCase):
    """jeopi skips a rule file that has neither `alwaysApply` nor a description, so a shipped rule
    source must open with frontmatter before its marker block or it never reaches the model."""

    def test_every_shipped_rule_source_declares_frontmatter(self):
        sources = sorted((ROOT / "jev").glob("*.rule.md"))
        self.assertTrue(sources, "no jev/*.rule.md rule sources found")
        for source in sources:
            with self.subTest(rule=source.name):
                lines = source.read_text(encoding="utf-8").splitlines()
                self.assertEqual(lines[0], "---", "frontmatter must be the first line")
                end = lines.index("---", 1)
                keys = {line.split(":", 1)[0].strip(): line.split(":", 1)[1].strip()
                        for line in lines[1:end] if ":" in line}
                self.assertTrue(keys.get("description") or keys.get("alwaysApply", "").lower() == "true")
                self.assertTrue(lines[end + 1].startswith("<!--"), "marker block must follow the frontmatter")


class CustomProjectWorkflowIsolationTests(unittest.TestCase):
    """Global workspace defaults apply by default while per-project customWorkflow settings stay isolated."""

    def test_global_default_vs_custom_project_isolation_and_reset(self):
        box = Sandbox(jev=True)
        self.addCleanup(box.cleanup)
        proj_a = box.project / "proj-a"
        proj_b = box.project / "proj-b"
        proj_a.mkdir()
        proj_b.mkdir()
        state_dir = box.home / ".local/state/jeo-skill"
        env = {"JEO_SKILL_STATE_DIR": str(state_dir)}

        # 1. Project A uses global default workflow.
        proc_a, rep_a = box.run("--no-activate", project=proj_a, env=env)
        self.assertEqual(proc_a.returncode, 0, proc_a.stderr)
        self.assertTrue((box.home / ".agents/harness/workspace.json").is_file())
        global_ws = json.loads((box.home / ".agents/harness/workspace.json").read_text(encoding="utf-8"))
        self.assertEqual(global_ws["scope"], "global")
        self.assertFalse(global_ws["default_workflow"]["custom"])

        ws_a = json.loads((proj_a / ".harness2/workspace.json").read_text(encoding="utf-8"))
        self.assertFalse(ws_a["workflow"]["custom"])
        self.assertEqual(ws_a["workflow"]["order"], ["openspace", "rtk", "semble", "jev", "memory"])
        v_a, _ = box.run("--verify", project=proj_a, env=env)
        self.assertEqual(v_a.returncode, 0, v_a.stdout)

        # 2. Project B isolates its own custom workflow with Jev & OpenSpace disabled.
        proc_b, _ = box.run(
            "--no-activate", "--custom-workflow", "--workflow-order", "rtk,semble,mex", "--jev-profile", "off",
            project=proj_b, env=env,
        )
        self.assertEqual(proc_b.returncode, 0, proc_b.stderr)
        ws_b = json.loads((proj_b / ".harness2/workspace.json").read_text(encoding="utf-8"))
        self.assertTrue(ws_b["workflow"]["custom"])
        self.assertEqual(ws_b["workflow"]["order"], ["rtk", "semble", "mex"])
        self.assertFalse(ws_b["workflow"]["openspace_enabled"])
        self.assertFalse(ws_b["workflow"]["jev_enabled"])
        rule_b = (proj_b / ".agents/rules" / RULE).read_text(encoding="utf-8")
        self.assertIn("customWorkflow: true", rule_b)
        self.assertIn("rtk, semble, mex", rule_b)
        global_rule = (box.home / ".agents/rules" / RULE).read_text(encoding="utf-8")
        self.assertNotIn("customWorkflow: true", global_rule)

        # Verify passes even with customWorkflow: true!
        v_b, v_b_rep = box.run("--verify", project=proj_b, env=env)
        self.assertEqual(v_b.returncode, 0, v_b.stdout)
        self.assertTrue(v_b_rep["workflow"]["custom"])

        # 3. Re-running default setup-workspace on Project B must PRESERVE its isolated workflow & rule.
        (proj_b / ".agents/rules" / RULE).write_text(rule_b + "\n<!-- custom-note -->\n", encoding="utf-8")
        proc_b2, rep_b2 = box.run("--no-activate", project=proj_b, env=env)
        self.assertEqual(proc_b2.returncode, 0, proc_b2.stderr)
        self.assertIn("preserved (customWorkflow)", rep_b2["steps"]["rules"]["detail"])
        self.assertIn("custom-note", (proj_b / ".agents/rules" / RULE).read_text(encoding="utf-8"))
        ws_b2 = json.loads((proj_b / ".harness2/workspace.json").read_text(encoding="utf-8"))
        self.assertTrue(ws_b2["workflow"]["custom"])
        self.assertEqual(ws_b2["workflow"]["order"], ["rtk", "semble", "mex"])

        # 4. Unified workflow-events.jsonl recorded on apply, not on dry-run.
        events_file = state_dir / "workflow-events.jsonl"
        self.assertTrue(events_file.is_file())
        lines_before = len(events_file.read_text(encoding="utf-8").splitlines())
        box.run("--dry-run", project=proj_b, env=env)
        self.assertEqual(len(events_file.read_text(encoding="utf-8").splitlines()), lines_before)

        # 5. OpenSpace route_prompt respects project override in Project B.
        router_py = ROOT / ".agent-skills/openspace/scripts/route_prompt.py"
        os_disabled = subprocess.run(
            [sys.executable, str(router_py), "--json", "debug issue"],
            cwd=proj_b, env={**os.environ, "HOME": str(box.home), "JEO_SKILL_STATE_DIR": str(state_dir)},
            capture_output=True, text=True, check=True,
        )
        self.assertEqual(os_disabled.stdout.strip(), "[]")

        # 6. --reset-project-workflow restores Project B to global inheritance.
        proc_reset, _ = box.run("--no-activate", "--reset-project-workflow", project=proj_b, env=env)
        self.assertEqual(proc_reset.returncode, 0, proc_reset.stderr)
        ws_b_reset = json.loads((proj_b / ".harness2/workspace.json").read_text(encoding="utf-8"))
        self.assertFalse(ws_b_reset["workflow"]["custom"])
        self.assertNotIn("customWorkflow: true", (proj_b / ".agents/rules" / RULE).read_text(encoding="utf-8"))



class HostSkillIsolationTests(unittest.TestCase):
    """Host skill isolation keeps jeopi/omp/gjc/jeo off .claude/skills and prunes duplicate shared links."""

    def test_host_isolation_configures_pi_family_and_jeo_and_prunes_shared_links(self):
        box = Sandbox()
        self.addCleanup(box.cleanup)
        # Populate shared root + installed host configs + redundant shared-root symlinks
        shared = box.home / ".agents/skills"
        (shared / "alpha").mkdir(parents=True)
        (shared / "alpha/SKILL.md").write_text("---\nname: alpha\ndescription: alpha\n---\n", encoding="utf-8")

        jeopi_cfg = box.home / ".jeopi/agent/config.yml"
        jeopi_cfg.parent.mkdir(parents=True)
        jeopi_cfg.write_text("setupVersion: 1\nmodelRoles:\n  default: anthropic/claude-opus-5-5\n", encoding="utf-8")

        gjc_cfg = box.home / ".gjc/agent/config.yml"
        gjc_cfg.parent.mkdir(parents=True)
        gjc_cfg.write_text(
            "skills:\n  enabled: true\n  enablePiUser: true\n  ignoredSkills:\n    - '*test*'\n",
            encoding="utf-8",
        )

        jeo_cfg = box.home / ".jeo/config.json"
        jeo_cfg.parent.mkdir(parents=True)
        jeo_cfg.write_text(json.dumps({"defaultModel": "openai/gpt-5.4"}) + "\n", encoding="utf-8")

        # Redundant shared-root links (should be pruned) vs external/real entries (must be kept)
        opencode_dir = box.home / ".config/opencode/skills"
        opencode_dir.mkdir(parents=True)
        (opencode_dir / "alpha").symlink_to(shared / "alpha")
        ext_target = box.home / ".orchestra/skills/custom"
        ext_target.mkdir(parents=True)
        (opencode_dir / "custom").symlink_to(ext_target)
        (opencode_dir / "local-real").mkdir()

        cursor_dir = box.home / ".cursor/skills"
        cursor_dir.mkdir(parents=True)
        (cursor_dir / "alpha").symlink_to(shared / "alpha")

        jeo_skills_dir = box.home / ".jeo/skills"
        jeo_skills_dir.mkdir(parents=True)
        (jeo_skills_dir / "alpha").symlink_to(shared / "alpha")

        # Dry-run must leave everything untouched
        dry_proc, dry_rep = box.run("--dry-run", "--skills-root", str(shared))
        self.assertEqual(dry_proc.returncode, 0, dry_proc.stderr)
        self.assertEqual(dry_rep["steps"]["host-isolation"]["status"], "planned")
        self.assertTrue((opencode_dir / "alpha").is_symlink())
        self.assertNotIn("enableClaudeUser", jeopi_cfg.read_text(encoding="utf-8"))

        # Apply
        proc, rep = box.run("--skills-root", str(shared))
        self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
        self.assertEqual(rep["steps"]["host-isolation"]["status"], "ok")

        jeopi_text = jeopi_cfg.read_text(encoding="utf-8")
        for needle in (
            "default: anthropic/claude-opus-5-5",
            "enableClaudeUser: false",
            "enableClaudeProject: false",
            "enableCodexUser: false",
            "enablePiUser: true",
            "enableAgentsUser: true",
            "- claude-plugins",
        ):
            self.assertIn(needle, jeopi_text)

        gjc_text = gjc_cfg.read_text(encoding="utf-8")
        self.assertIn("- '*test*'", gjc_text)
        self.assertIn("enableClaudeUser: false", gjc_text)
        self.assertIn("- claude-plugins", gjc_text)

        jeo_data = json.loads(jeo_cfg.read_text(encoding="utf-8"))
        self.assertEqual(jeo_data["defaultModel"], "openai/gpt-5.4")
        self.assertFalse(jeo_data["skills"]["includeForeignDirs"])
        self.assertFalse(jeo_data["skills"]["enableClaude"])

        # Redundant shared links removed; external link & real dir preserved
        self.assertFalse((opencode_dir / "alpha").exists() or (opencode_dir / "alpha").is_symlink())
        self.assertTrue((opencode_dir / "custom").is_symlink())
        self.assertTrue((opencode_dir / "local-real").is_dir())
        self.assertFalse((cursor_dir / "alpha").exists() or (cursor_dir / "alpha").is_symlink())
        self.assertFalse((jeo_skills_dir / "alpha").exists() or (jeo_skills_dir / "alpha").is_symlink())

        # Idempotent second run
        proc2, rep2 = box.run("--skills-root", str(shared))
        self.assertEqual(proc2.returncode, 0, proc2.stderr)
        self.assertIn("jeopi: current", rep2["steps"]["host-isolation"]["detail"])
        self.assertIn("jeo: current", rep2["steps"]["host-isolation"]["detail"])

    def test_refresh_host_links_excludes_shared_hosts_by_default_and_prunes_when_requested(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        home = Path(tmp.name)
        shared = home / ".agents/skills"
        (shared / "demo").mkdir(parents=True)
        (shared / "demo/SKILL.md").write_text("---\nname: demo\ndescription: demo\n---\n", encoding="utf-8")
        catalog = home / "skills.json"
        catalog.write_text(json.dumps({"skills": [{"name": "demo"}]}), encoding="utf-8")
        for sub in (".claude/skills", ".config/opencode/skills", ".cursor/skills"):
            (home / sub).mkdir(parents=True)
        (home / ".config/opencode/skills/demo").symlink_to(shared / "demo")
        (home / ".cursor/skills/demo").symlink_to(shared / "demo")

        script = ROOT / "scripts/refresh-host-links.py"
        proc = subprocess.run(
            [sys.executable, str(script), "--apply", "--prune-shared-links"],
            env={"HOME": str(home), "JEO_SKILLS_SHARED_ROOT": str(shared), "JEO_SKILLS_CATALOG_JSON": str(catalog)},
            capture_output=True, text=True, check=True,
        )
        report = json.loads(proc.stdout)
        self.assertTrue((home / ".claude/skills/demo").is_symlink())
        self.assertFalse((home / ".config/opencode/skills/demo").is_symlink())
        self.assertFalse((home / ".cursor/skills/demo").is_symlink())
        self.assertEqual(report["tally"].get("prune-shared-link"), 2)

    def test_repair_flag_forwards_to_second_brain_setup(self):
        box = Sandbox()
        self.addCleanup(box.cleanup)
        proc, rep = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        brain_calls = [c for c in box.calls() if c.startswith("brain-setup ")]
        self.assertTrue(brain_calls)
        self.assertNotIn("--repair", brain_calls[-1])

        proc2, rep2 = box.run("--repair")
        self.assertEqual(proc2.returncode, 0, proc2.stderr)
        brain_calls2 = [c for c in box.calls() if c.startswith("brain-setup ")]
        self.assertIn("--repair", brain_calls2[-1])

    def test_setup_workspace_installs_second_brain_and_ontology_crud_search_wrappers(self):
        box = Sandbox()
        self.addCleanup(box.cleanup)
        shutil.copy2(ROOT / ".agent-skills/obsidian-second-brain/scripts/vault_ops.py",
                     box.skills / "obsidian-second-brain/scripts/vault_ops.py")
        shutil.copy2(ROOT / ".agent-skills/obsidian-second-brain/scripts/ctx_guard.py",
                     box.skills / "obsidian-second-brain/scripts/ctx_guard.py")
        shutil.copy2(ROOT / ".agent-skills/open-ontologies/scripts/onto_ops.py",
                     box.skills / "open-ontologies/scripts/onto_ops.py")
        (box.project / "knowledge/ontology").mkdir(parents=True, exist_ok=True)
        proc, rep = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue((box.home / ".local/bin/second-brain").is_file())
        self.assertTrue((box.home / ".local/bin/jeo-ontology").is_file())
        self.assertTrue((box.home / ".open-ontologies/config.toml").is_file())
        cfg_text = (box.home / ".open-ontologies/config.toml").read_text(encoding="utf-8")
        self.assertIn("ontology_dirs", cfg_text)

    def test_onto_ops_save_update_delete_search_and_embeddings_install_contract(self):
        install_sh = (ROOT / ".agent-skills/open-ontologies/scripts/install.sh").read_text(encoding="utf-8")
        self.assertIn("OPEN_ONTOLOGIES_FEATURES:-embeddings", install_sh)
        self.assertIn("--features", install_sh)

        tmp = Path(tempfile.mkdtemp(prefix="onto-ops-test-"))
        self.addCleanup(lambda: shutil.rmtree(tmp, ignore_errors=True))
        onto_ops = ROOT / ".agent-skills/open-ontologies/scripts/onto_ops.py"
        ttl = tmp / "sample.ttl"
        env = {**os.environ, "HOME": str(tmp), "OPEN_ONTOLOGIES_BIN": "none"}

        def run_oo(*args: str) -> dict:
            p = subprocess.run(
                [sys.executable, str(onto_ops), *args],
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            return json.loads(p.stdout)

        s1 = run_oo("save", "--file", str(ttl), "--subject", "jb:Maponaru", "--predicate", "rdfs:label", "--object", "마포나루", "--json")
        self.assertEqual(s1["status"], "saved")
        s2 = run_oo("save", "--file", str(ttl), "--subject", "jb:Maponaru", "--predicate", "rdfs:comment", "--object", "나루터 배경", "--json")
        self.assertEqual(s2["total_triples"], 2)

        q1 = run_oo("search", "마포나루", "--file", str(ttl), "--json")
        self.assertGreaterEqual(q1["count"], 1)
        self.assertEqual(q1["hits"][0]["subject"], "jb:Maponaru")

        u1 = run_oo("update", "--file", str(ttl), "--subject", "jb:Maponaru", "--predicate", "rdfs:label", "--object", "새 마포나루", "--json")
        self.assertEqual(u1["status"], "updated")
        q2 = run_oo("search", "새 마포나루", "--file", str(ttl), "--json")
        self.assertGreaterEqual(q2["count"], 1)

        d1 = run_oo("delete", "--file", str(ttl), "--subject", "jb:Maponaru", "--predicate", "rdfs:comment", "--json")
        self.assertEqual(d1["status"], "deleted")
        self.assertEqual(d1["total_triples"], 1)


if __name__ == "__main__":
    unittest.main()