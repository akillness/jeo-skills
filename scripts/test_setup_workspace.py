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


if __name__ == "__main__":
    unittest.main()
