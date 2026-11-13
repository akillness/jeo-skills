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
        proc, report = box.run()
        self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
        statuses = {k: v["status"] for k, v in report["steps"].items()}
        self.assertEqual(set(statuses.values()), {"ok"}, statuses)
        for prefix in ("mex-install", "zg index", "zg status --check-ready", "brain-setup",
                       "oo-smoke", "openspace-install", "route-hooks install", "rtk init -g --auto-patch"):
            self.assertTrue(box.called(prefix), f"{prefix} not called: {box.calls()}")
        self.assertIn(f"mex-install {box.project} --skip-skill", box.calls())
        # zvec indexes the project with the pinned local embedding on first run only
        self.assertIn("zg index --embedding local/potion-code-16m-v2", box.calls())

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
        for needle in ("second-brain", "mex-agent", "zg query", "open-ontologies", "harness2", ".harness2/workspace.json"):
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
        for var in ("JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS", "JEO_SKILLS_APPROVE_KNOWLEDGE_DATA"):
            with self.subTest(var=var):
                box = self.sandbox()
                proc, report = box.run(env={var: "false"})
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


if __name__ == "__main__":
    unittest.main()
