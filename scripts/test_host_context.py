#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
HOOKS = ROOT / "hooks"
JEO_SKILL_PY = ROOT / ".agent-skills" / "jeo-skill" / "scripts" / "jeo-skill.py"
INSTALL_SH = ROOT / "install.sh"
SETUP_WS = SCRIPTS / "setup-workspace.py"
SETUP_HC = SCRIPTS / "setup-host-context.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


hc = load_module(SETUP_HC, "setup_host_context")


def clean_env(home: Path, **extra: str) -> dict[str, str]:
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin"),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "TERM": "dumb",
    }
    env.update(extra)
    return env


class HostContextUnitAndIntegrationTests(unittest.TestCase):
    def test_does_not_create_missing_host_directories(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td).resolve()
            (home / ".claude").mkdir()
            (home / ".config" / "opencode").mkdir(parents=True)

            rep = hc.sync_host_context(home, repo_root=ROOT, env=clean_env(home))
            self.assertEqual(rep["notes"], [])
            self.assertEqual(sorted(h["host"] for h in rep["hosts"]), ["claude", "opencode"])
            for absent in (
                ".jeo",
                ".codex",
                ".gemini",
                ".pi",
                ".omp",
                ".gjc",
                ".jeopi",
                ".cursor",
                ".kimi-code",
            ):
                self.assertFalse((home / absent).exists(), f"Should not create {absent}")

            ok, checks = hc.verify_host_context(home, env=clean_env(home))
            self.assertTrue(ok, checks)

    def test_all_detected_hosts_jsonc_preservation_legacy_upgrade_and_idempotency(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td).resolve()
            for rel in (
                ".jeo",
                ".jeopi/agent/extensions",
                ".gjc/agent/extensions",
                ".pi/agent/extensions",
                ".omp/agent/extensions",
                ".claude",
                ".codex",
                ".gemini/hooks",
                ".gemini/config",
                ".gemini/antigravity-cli",
                ".gemini/antigravity",
                ".config/opencode/plugins",
                ".cursor",
                ".kimi-code",
            ):
                (home / rel).mkdir(parents=True, exist_ok=True)

            # Seed external + legacy configs that MUST survive upgrades cleanly
            (home / ".claude" / "settings.json").write_text(
                json.dumps(
                    {
                        "env": {"CUSTOM_FLAG": "keep"},
                        "hooks": {
                            "UserPromptSubmit": [
                                {"hooks": [{"type": "command", "command": "bash ~/.orca/prompt.sh"}]},
                                {"hooks": [{"type": "command", "command": "python3 /Users/someone/vaults/llm-wiki/scripts/ingest-prompt.py"}]},
                            ],
                            "Stop": [
                                {"hooks": [{"type": "command", "command": "bash ~/.superset/stop.sh"}]},
                                {"hooks": [{"type": "command", "command": "python3 ~/vaults/llm-wiki/scripts/ingest-output.py"}]},
                            ],
                            "PostCompact": [
                                {"hooks": [{"type": "command", "command": "python3 ~/.jeo/second-brain/runtime.py postcompact"}]},
                            ],
                        },
                    }
                ),
                encoding="utf-8",
            )
            (home / ".jeo" / "hooks.json").write_text(
                json.dumps(
                    {
                        "hooks": [
                            {"event": "pre-prompt", "run": "node ~/.agents/jev/jev-plugin.mjs"},
                            {"event": "pre-prompt", "run": "python3 ~/vaults/llm-wiki/scripts/ingest-prompt.py"},
                            {"event": "turn-end", "run": "python3 ~/vaults/llm-wiki/scripts/ingest-output.py"},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            (home / ".gemini" / "settings.json").write_text(
                json.dumps(
                    {
                        "hooks": {
                            "BeforeAgent": [
                                {
                                    "matcher": "*",
                                    "hooks": [
                                        {"name": "openspace-route", "type": "command", "command": "bash ~/.agents/hooks/openspace-route.sh gemini"},
                                        {"name": "llm-wiki-ingest", "type": "command", "command": 'bash "~/.gemini/hooks/llm-wiki-ingest.sh"'},
                                    ],
                                }
                            ],
                            "AfterAgent": [
                                {
                                    "matcher": "*",
                                    "hooks": [
                                        {"name": "ralph-check", "type": "command", "command": "bash ~/.gemini/hooks/ralph-check.sh"},
                                        {"name": "llm-wiki-ingest", "type": "command", "command": 'bash "~/.gemini/hooks/llm-wiki-ingest.sh"'},
                                    ],
                                }
                            ],
                        }
                    }
                ),
                encoding="utf-8",
            )
            (home / ".gemini" / "config" / "hooks.json").write_text(
                json.dumps(
                    {
                        "orca-status": {"PreInvocation": [{"type": "command", "command": "orca status"}]},
                        "openspace-route": {"PreInvocation": [{"type": "command", "command": "openspace"}]},
                    }
                ),
                encoding="utf-8",
            )
            agy_settings_before = {"model": "Orchestrator (Carbon)", "trustedWorkspaces": ["/tmp/ws"]}
            (home / ".gemini" / "antigravity-cli" / "settings.json").write_text(
                json.dumps(agy_settings_before, indent=2), encoding="utf-8"
            )
            (home / ".jeopi" / "agent" / "extensions" / "llm-wiki-ingest.ts").write_text(
                '// legacy ~/vaults/llm-wiki + ingest-output.py\n', encoding="utf-8"
            )
            (home / ".jeopi" / "agent" / "extensions" / "orca-status.ts").write_text(
                "// keep external\n", encoding="utf-8"
            )
            (home / ".cursor" / "hooks.json").write_text(
                json.dumps(
                    {
                        "version": 1,
                        "hooks": {
                            "beforeSubmitPrompt": [{"command": "bash ~/.superset/cursor.sh"}],
                            "stop": [{"command": "bash ~/.orca/cursor.sh"}],
                        },
                    }
                ),
                encoding="utf-8",
            )
            opencode_jsonc = home / ".config" / "opencode" / "opencode.jsonc"
            opencode_jsonc.write_text(
                '{\n'
                '  // User comment at top\n'
                '  "plugin": ["openspace-route"],\n'
                '  /* block comment */\n'
                '  "instructions": [\n'
                '    "~/custom/project-rule.md", // inline comment\n'
                '  ],\n'
                '}\n',
                encoding="utf-8",
            )

            env = clean_env(home)
            rep1 = hc.sync_host_context(home, repo_root=ROOT, env=env)
            self.assertEqual(rep1["notes"], [])
            self.assertTrue(rep1["changed"])

            # Verify JSONC comments + custom instruction preserved & managed rules appended
            oc_after = opencode_jsonc.read_text(encoding="utf-8")
            self.assertIn("// User comment at top", oc_after)
            self.assertIn("/* block comment */", oc_after)
            self.assertIn("// inline comment", oc_after)
            self.assertIn("~/custom/project-rule.md", oc_after)
            self.assertIn("jeo-tool-flow.md", oc_after)
            oc_parsed = json.loads(hc._strip_jsonc(oc_after))
            self.assertIn("~/custom/project-rule.md", oc_parsed["instructions"])

            # Verify AGY CLI settings.json was NOT polluted with Gemini CLI hooks
            self.assertEqual(
                json.loads((home / ".gemini" / "antigravity-cli" / "settings.json").read_text(encoding="utf-8")),
                agy_settings_before,
            )
            self.assertTrue((home / ".gemini" / "antigravity-cli" / "GEMINI.md").is_file())
            self.assertTrue((home / ".gemini" / "antigravity-cli" / "rules" / "jeo-tool-flow.md").exists())

            # Verify Claude external hooks preserved, legacy replaced, no duplicate second-brain compact
            cs = json.loads((home / ".claude" / "settings.json").read_text(encoding="utf-8"))
            self.assertEqual(cs["env"]["CUSTOM_FLAG"], "keep")
            self.assertEqual(cs["env"]["LLM_WIKI_VAULT"], str(home / "vaults" / "llm-wiki"))
            cs_dump = json.dumps(cs)
            self.assertIn("~/.orca/prompt.sh", cs_dump)
            self.assertIn("~/.superset/stop.sh", cs_dump)
            self.assertNotIn("/Users/someone/vaults/llm-wiki", cs_dump)
            self.assertNotIn("~/vaults/llm-wiki/scripts/ingest-output.py", cs_dump)
            self.assertEqual(len(cs["hooks"]["PostCompact"]), 1)

            # Verify Jeo preserved jev-plugin, upgraded legacy turn-end with JEO_HOOK_EVENT=Stop, regular AGENTS.md
            self.assertTrue((home / ".jeo" / "agent" / "AGENTS.md").is_file())
            self.assertFalse((home / ".jeo" / "agent" / "AGENTS.md").is_symlink())
            jh = json.loads((home / ".jeo" / "hooks.json").read_text(encoding="utf-8"))
            runs = [e.get("run", "") for e in jh["hooks"]]
            self.assertTrue(any("jev-plugin.mjs" in r for r in runs))
            self.assertTrue(any("JEO_HOOK_EVENT=Stop" in r and "ingest-prompt.py" in r for r in runs))
            self.assertFalse(any("~/vaults/llm-wiki/scripts/ingest-output.py" in r for r in runs))

            # Verify Gemini preserved external hooks & upgraded legacy llm-wiki-ingest
            gs = json.loads((home / ".gemini" / "settings.json").read_text(encoding="utf-8"))
            gs_dump = json.dumps(gs)
            self.assertIn("openspace-route.sh", gs_dump)
            self.assertIn("ralph-check.sh", gs_dump)
            self.assertNotIn('"bash \\"~/.gemini/hooks/llm-wiki-ingest.sh\\""', gs_dump)

            # Verify AGY config hooks preserved external keys and added jeo-context
            ch = json.loads((home / ".gemini" / "config" / "hooks.json").read_text(encoding="utf-8"))
            self.assertIn("orca-status", ch)
            self.assertIn("openspace-route", ch)
            self.assertIn("jeo-context", ch)

            # Verify JeoPi kept external extension and upgraded legacy ingest extension
            self.assertTrue((home / ".jeopi" / "agent" / "extensions" / "orca-status.ts").is_file())
            pi_ext = (home / ".jeopi" / "agent" / "extensions" / "llm-wiki-ingest.ts").read_text(encoding="utf-8")
            self.assertIn("jeo-skills-managed", pi_ext)

            # Verify Cursor preserved superset/orca
            cur = json.loads((home / ".cursor" / "hooks.json").read_text(encoding="utf-8"))
            cur_dump = json.dumps(cur)
            self.assertIn("superset/cursor.sh", cur_dump)
            self.assertIn("orca/cursor.sh", cur_dump)
            self.assertTrue((home / ".cursor" / "rules" / "jeo-tool-flow.mdc").exists())

            # Verify symlink SSOT projection on host rules
            self.assertTrue((home / ".claude" / "rules" / "jeo-tool-flow.md").is_symlink())

            # Verify 2nd sync is strictly idempotent
            rep2 = hc.sync_host_context(home, repo_root=ROOT, env=env)
            self.assertEqual(rep2["notes"], [])
            self.assertEqual(rep2["changed"], [])

            ok, checks = hc.verify_host_context(home, env=env)
            self.assertTrue(ok, [c for c in checks if not c["ok"]])

            # Verify ~/.local/bin/ctx shim runs cleanly in isolated HOME
            ctx_proc = subprocess.run(
                [str(home / ".local" / "bin" / "ctx"), "status", "--json"],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(ctx_proc.returncode, 0, ctx_proc.stderr)

    def test_custom_vault_config_and_runtime_hooks(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td).resolve()
            wiki_vault = home / "custom-wiki"
            sb_vault = home / "custom-sb"
            (home / ".claude").mkdir()
            (home / ".jeo").mkdir()
            wiki_vault.mkdir()
            sb_vault.mkdir()

            env = clean_env(
                home,
                LLM_WIKI_VAULT=str(wiki_vault),
                JEO_SECOND_BRAIN_VAULT=str(sb_vault),
            )
            rep = hc.sync_host_context(
                home,
                repo_root=ROOT,
                wiki_vault=str(wiki_vault),
                second_brain_vault=str(sb_vault),
                env=env,
            )
            self.assertEqual(rep["notes"], [])
            # Run ingest-prompt.py using only context-config.json (NO vault env vars!)
            hook_env = clean_env(home)
            p1 = subprocess.run(
                [sys.executable, str(home / ".agents" / "hooks" / "ingest-prompt.py")],
                input=json.dumps({"hook_event_name": "UserPromptSubmit", "session_id": "s1", "prompt": "check vault config", "cwd": str(home)}),
                env=hook_env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(p1.returncode, 0, p1.stderr)
            self.assertTrue(list((wiki_vault / "raw" / "sources").rglob("*.md")))

            # Run Stop delegation via JEO_HOOK_EVENT=Stop (as configured for jeo turn-end)
            p2 = subprocess.run(
                [sys.executable, str(home / ".agents" / "hooks" / "ingest-prompt.py")],
                input=json.dumps({"session_id": "s1", "last_assistant_message": "answer captured", "cwd": str(home)}),
                env=clean_env(home, JEO_HOOK_EVENT="Stop"),
                capture_output=True,
                text=True,
            )
            self.assertEqual(p2.returncode, 0, p2.stderr)
            all_md = "\n".join(p.read_text(encoding="utf-8") for p in wiki_vault.rglob("*.md"))
            self.assertIn("check vault config", all_md)
            self.assertIn("answer captured", all_md)
    def test_setup_workspace_global_only_verify_and_vetoes(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td).resolve()
            (home / ".claude").mkdir()
            (home / ".jeo").mkdir()
            env = clean_env(home)

            # Without --global-only, --project $HOME must refuse cleanly
            bad = subprocess.run(
                [sys.executable, str(SETUP_WS), "--project", str(home), "--home", str(home), "--skills-root", str(ROOT / ".agent-skills")],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(bad.returncode, 2)
            # Dry-run writes nothing in --global-only mode
            dry = subprocess.run(
                [
                    sys.executable,
                    str(SETUP_WS),
                    "--project",
                    str(home),
                    "--home",
                    str(home),
                    "--skills-root",
                    str(ROOT / ".agent-skills"),
                    "--global-only",
                    "--dry-run",
                    "--json",
                ],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(dry.returncode, 0, dry.stdout + dry.stderr)
            dry_report = json.loads(dry.stdout)
            self.assertNotIn("ok", {v["status"] for v in dry_report["steps"].values()})
            self.assertFalse((home / ".claude" / "settings.json").exists())
            self.assertFalse((home / ".agents" / "context-config.json").exists())

            # Vetoed run skips host-context hook/config writes
            veto_env = clean_env(home, JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS="false")
            vetoed = subprocess.run(
                [
                    sys.executable,
                    str(SETUP_WS),
                    "--project",
                    str(home),
                    "--home",
                    str(home),
                    "--skills-root",
                    str(ROOT / ".agent-skills"),
                    "--global-only",
                    "--json",
                ],
                env=veto_env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(vetoed.returncode, 0, vetoed.stdout + vetoed.stderr)
            veto_report = json.loads(vetoed.stdout)
            self.assertEqual(veto_report["steps"]["host-context"]["status"], "skipped")
            self.assertFalse((home / ".claude" / "settings.json").exists())

            # Real --global-only run wires everything and passes --global-only --verify
            ok = subprocess.run(
                [
                    sys.executable,
                    str(SETUP_WS),
                    "--project",
                    str(home),
                    "--home",
                    str(home),
                    "--skills-root",
                    str(ROOT / ".agent-skills"),
                    "--global-only",
                    "--skip",
                    "second-brain",
                    "--json",
                ],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
            self.assertTrue((home / ".claude" / "settings.json").is_file())
            self.assertTrue((home / ".jeo" / "hooks.json").is_file())

            ver = subprocess.run(
                [
                    sys.executable,
                    str(SETUP_WS),
                    "--project",
                    str(home),
                    "--home",
                    str(home),
                    "--skills-root",
                    str(ROOT / ".agent-skills"),
                    "--global-only",
                    "--verify",
                    "--json",
                ],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(ver.returncode, 0, ver.stdout + ver.stderr)
            self.assertTrue(json.loads(ver.stdout)["ok"])

    def test_jeo_skill_setup_syncs_hooks_and_host_context(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td).resolve()
            (home / ".claude").mkdir()
            (home / ".jeo").mkdir()
            # Pre-seed stale hook to verify upgrade (not just copy-if-missing)
            (home / ".agents" / "hooks").mkdir(parents=True)
            (home / ".agents" / "hooks" / "ingest-prompt.py").write_text("# stale\n", encoding="utf-8")
            env = clean_env(
                home,
                LLM_WIKI_VAULT=str(home / "vaults" / "wiki"),
            )
            proc = subprocess.run(
                [
                    sys.executable,
                    str(JEO_SKILL_PY),
                    "install",
                    "llm-wiki",
                    "--agent",
                    "universal",
                    "--global",
                    "--yes",
                    "--setup",
                    "--with-hooks",
                    "--source",
                    str(ROOT),
                ],
                cwd=str(home),
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertIn("context_config", (home / ".agents" / "hooks" / "ingest-prompt.py").read_text(encoding="utf-8"))
            self.assertTrue((home / ".agents" / "hooks" / "context_config.py").is_file())
            self.assertTrue((home / ".agents" / "hooks" / "ctx-hook.sh").is_file())
            self.assertTrue((home / ".local" / "bin" / "ctx").is_file())
            self.assertTrue((home / ".claude" / "settings.json").is_file())
            self.assertTrue((home / ".jeo" / "hooks.json").is_file())

    def test_install_sh_global_from_home_syncs_hooks_and_host_context(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            work = Path(td).resolve()
            home = work / "home"
            src = work / "source"
            home.mkdir()
            src.mkdir()
            (home / ".claude").mkdir()
            (home / ".jeo").mkdir()
            (home / ".config" / "opencode").mkdir(parents=True)
            (home / ".agents" / "hooks").mkdir(parents=True)
            (home / ".agents" / "hooks" / "ingest-prompt.py").write_text("# stale\n", encoding="utf-8")

            shutil.copytree(ROOT / ".agent-skills" / "jeo-skill", src / ".agent-skills" / "jeo-skill")
            shutil.copytree(ROOT / "hooks", src / "hooks")
            (src / "scripts").mkdir()
            shutil.copy2(SETUP_WS, src / "scripts" / "setup-workspace.py")
            shutil.copy2(SETUP_HC, src / "scripts" / "setup-host-context.py")
            full_tools = src / "scripts" / "install-full-tools.sh"
            full_tools.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            full_tools.chmod(0o755)
            catalog = work / "catalog.json"
            catalog.write_text(
                json.dumps(
                    {
                        "version": "test",
                        "skills": [{"name": "jeo-skill", "category": "workflow", "subcategory": "router", "description": "router"}],
                        "categories": {"workflow": {}},
                        "subcategories": {},
                        "bundles": {},
                    }
                ),
                encoding="utf-8",
            )
            sb_cfg = home / ".jeo" / "second-brain-config.json"
            sb_cfg.write_text(json.dumps({"vault": str(home / "vaults" / "sb"), "inbox": str(home / "vaults" / "sb-inbox")}) + "\n", encoding="utf-8")

            bin_dir = work / "stub-bin"
            bin_dir.mkdir()
            npx_stub = bin_dir / "npx"
            npx_stub.write_text(
                f'#!/bin/sh\n'
                f'mkdir -p "{home}/.agents/skills"\n'
                f'rm -rf "{home}/.agents/skills/jeo-skill"\n'
                f'cp -R "{src}/.agent-skills/jeo-skill" "{home}/.agents/skills/jeo-skill"\n'
                f'exit 0\n',
                encoding="utf-8",
            )
            npx_stub.chmod(0o755)
            claude_stub = bin_dir / "claude"
            claude_stub.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            claude_stub.chmod(0o755)

            env = clean_env(
                home,
                PATH=f"{bin_dir}:{os.environ.get('PATH', '/usr/bin:/bin')}",
                JEO_SKILLS_SOURCE=str(src),
                JEO_SKILLS_CATALOG=str(catalog),
                JEO_SKILLS_SELECTION="all",
                INSTALL_GLOBAL="true",
                JEO_SKILLS_JEV="skip",
                JEO_SKILLS_STAR="false",
                JEO_SKILLS_SECOND_BRAIN_CRONTAB="skip",
                JEO_SKILLS_READINESS="skip",
            )
            proc = subprocess.run(
                ["bash", str(INSTALL_SH)],
                cwd=str(home),
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertIn("context_config", (home / ".agents" / "hooks" / "ingest-prompt.py").read_text(encoding="utf-8"))
            self.assertTrue((home / ".agents" / "hooks" / "context_config.py").is_file())
            self.assertTrue((home / ".agents" / "hooks" / "ctx-hook.sh").is_file())
            self.assertTrue((home / ".local" / "bin" / "ctx").is_file())
            self.assertTrue((home / ".claude" / "settings.json").is_file())
            self.assertTrue((home / ".jeo" / "hooks.json").is_file())
            self.assertTrue((home / ".config" / "opencode" / "opencode.json").is_file())


if __name__ == "__main__":
    unittest.main()