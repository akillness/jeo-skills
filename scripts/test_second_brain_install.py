#!/usr/bin/env python3
"""Hermetic CLI acceptance tests for the second-brain installer and runtime.

The source-verification, Claude, crontab and ctx executables are controlled external
transports. All installation, capture, proposal validation and file writes are real.
This proves local orchestration, not upstream authenticity or live model quality.
Run: python3 scripts/test_second_brain_install.py -v
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / ".agent-skills/obsidian-second-brain"
PIN = "c8b1d8c1c5b41d4f1845f7188200d354837be96f"
COMMANDS = ("ingest", "daily", "reconcile", "synthesize", "recap", "health", "save")
HELP = "-p --safe-mode --tools --strict-mcp-config --mcp-config --model --output-format --json-schema --max-budget-usd --no-session-persistence --max-turns"


TRANSPORT = r'''import hashlib, json, os, sys
from pathlib import Path
name, args = Path(sys.argv[0]).name, sys.argv[1:]
def record(**extra):
    with open(os.environ['SB_CALLS'], 'a', encoding='utf-8') as out:
        out.write(json.dumps(dict(command=name, args=args, **extra), ensure_ascii=False) + '\n')
if name == 'claude':
    if args == ['--help']:
        record()
        print(os.environ['SB_HELP'])
    elif args == ['--version']:
        record()
        print('2.1.312 (fixture transport)')
    else:
        prompt = sys.stdin.read()
        record(prompt=prompt)
        for flag in ('--safe-mode', '--strict-mcp-config', '--no-session-persistence', '--json-schema', '--model', '--max-budget-usd'):
            if flag not in args:
                raise SystemExit('unsafe invocation missing ' + flag)
        if '--dangerously-skip-permissions' in args or args[args.index('--tools') + 1] != '':
            raise SystemExit('tool access must be disabled')
        mcp = args[args.index('--mcp-config') + 1]
        mcp_config = json.loads(mcp) if mcp.startswith('{') else json.loads(Path(mcp).read_text())
        if mcp_config != {'mcpServers': {}}:
            raise SystemExit('ambient MCP access must be disabled')
        control = json.loads(Path(os.environ['SB_RESPONSE']).read_text())
        if control.get('block'):
            # A deterministic blocked external process; runtime's subprocess deadline
            # must terminate it. No sleep/race decides whether this test passes.
            import signal
            signal.pause()
        if control.get('exit'):
            print('fixture model failure', file=sys.stderr)
            raise SystemExit(control['exit'])
        print(control.get('raw', json.dumps(control.get('envelope'), ensure_ascii=False)))
elif name == 'crontab':
    record()
    cron = Path(os.environ['SB_CRON'])
    if args == ['-l']:
        if cron.exists():
            sys.stdout.write(cron.read_text())
        else:
            raise SystemExit(1)
    elif args == ['-']:
        cron.write_text(sys.stdin.read())
    elif len(args) == 1:
        cron.write_bytes(Path(args[0]).read_bytes())
    else:
        raise SystemExit('unrecognized crontab operation')
elif name == 'git':
    record()
    if 'ls-tree' in args:
        manifest = json.loads(Path(os.environ['SB_TREE']).read_text())
        for path, blob in sorted(manifest.items()):
            sys.stdout.buffer.write(('100644 blob ' + blob + '\t' + path).encode() + b'\0')
    elif 'rev-parse' in args:
        print(os.environ['SB_PIN'])
    else:
        raise SystemExit('fixture forbids git network/mutation: ' + repr(args))
elif name in ('graphify', 'mex-agent', 'zg'):
    record()
    if os.environ.get('SB_INDEX_FAIL') == name:
        print('fixture indexer failed', file=sys.stderr)
        raise SystemExit(29)
    if name == 'graphify' and args[0] == 'update':
        target = Path(args[1]) / 'graphify-out/graph.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps({'nodes': [
            {'id': 'live', 'source_file': 'index.md', 'label': 'Live source'},
            {'id': 'deleted', 'source_file': 'wiki/deleted.md', 'label': 'Deleted source'},
            {'id': 'meaning', 'file_type': 'semantic', 'label': 'Preserved meaning'},
        ], 'links': [{'source': 'live', 'target': 'meaning'}, {'source': 'deleted', 'target': 'meaning'}]}))
    if name == 'mex-agent':
        print(json.dumps({'state': 'succeeded'}))
elif name == 'ctx':
    record()
    if os.environ.get('SB_CTX_FAIL'):
        print('fixture ctx failure', file=sys.stderr)
        raise SystemExit(29)
else:
    record()
    raise SystemExit('forbidden external operation: ' + name)
'''


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def snapshot(root: Path) -> tuple:
    """Include bytes, links and modes without dereferencing fixture symlinks."""
    result = []
    for path in sorted(root.rglob("*")):
        rel = str(path.relative_to(root))
        if path.is_symlink():
            result.append((rel, "link", os.readlink(path)))
        elif path.is_dir():
            result.append((rel, "dir", path.stat().st_mode & 0o777))
        else:
            result.append((rel, "file", path.stat().st_mode & 0o777, path.read_bytes()))
    return tuple(result)


class SecondBrainAcceptance(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="second-brain-acceptance-")
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name).resolve()
        self.home = self.work / "home"
        self.bin = self.work / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        # Always execute the distributed copy, never import repository internals.
        self.package = self.home / ".agents/skills/obsidian-second-brain"
        shutil.copytree(PACKAGE, self.package)
        self.scripts = self.package / "scripts"
        self.source = self.work / "verified-source-fixture"
        self.source.mkdir()
        (self.source / ".git").mkdir()
        (self.source / ".git/HEAD").write_text(PIN + "\n")
        payloads = {
            "SKILL.md": "---\nname: obsidian-second-brain\ndescription: Controlled upstream fixture\n---\n# Second brain\n",
            "LICENSE": "MIT License\nCopyright fixture\n",
            "references/ai-first-rules.md": "# AI-first rules\nReconcile claims against the source.\n",
            "references/claude-md-template.md": "# Vault rules\n@.second-brain/upstream/SKILL.md\n",
            "scripts/bootstrap_vault.py": "def write_core_templates(vault):\n    write(vault / 'Templates/Fixture.md', '# Source template\\n{{date}}\\n')\n",
        }
        for command in COMMANDS:
            payloads[f"commands/obsidian-{command}.md"] = f"# {command}\nVerified fixture operating instruction for {command}.\n"
        for name in ("projects", "people", "tasks", "daily"):
            payloads[f"references/bases/{name}.base.template"] = f"views:\n  - type: table\n    name: {name}\n"
        for name, text in payloads.items():
            target = self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        # These must never be executed merely because they appear in upstream.
        for name in ("setup.sh", "hooks/obsidian-bg-agent.sh"):
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('#!/bin/sh\nprintf unsafe > "$HOME/unsafe-upstream-ran"\nexit 99\n')
            path.chmod(0o700)
        manifest = {}
        for name in payloads:
            data = (self.source / name).read_bytes()
            manifest[name] = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        self.tree = self.work / "verified-tree.json"
        self.tree.write_text(json.dumps(manifest))
        for name in ("claude", "crontab", "git", "ctx", "curl", "wget", "npm", "npx", "graphify", "mex-agent", "zg"):
            path = self.bin / name
            path.write_text(f"#!{sys.executable}\n" + TRANSPORT)
            path.chmod(0o700)
        (self.bin / "python3").symlink_to(sys.executable)
        self.calls_path = self.work / "calls.jsonl"
        self.response_path = self.work / "response.json"
        self.cron = self.work / "crontab"
        self.cron.write_text("17 4 * * * /existing/job # 사용자\n")
        self.vault = self.home / "vault 새 지식"
        self.inbox = self.work / "inbox 수집"
        self.config_path = self.work / "approved.json"
        self.config = {
            "version": 1,
            "vault": str(self.vault), "inbox": str(self.inbox),
            "model": "explicit-fixture-model", "claude_bin": str(self.bin / "claude"),
            "max_run_usd": 0.25, "daily_budget_usd": 3.0,
            "timeout_seconds": 15, "max_input_bytes": 262144,
            "consent": {key: True for key in ("download", "data", "model", "hooks", "schedule", "postcompact")},
            "schedules": {"scan": "*/7 * * * *", "morning": "11 8 * * *", "nightly": "23 22 * * *", "weekly": "31 18 * * 5", "health": "47 21 * * 0"},
            "integrations": {key: True for key in ("ctx", "graphify", "mex", "zvec")},
        }
        self.save_config()
        self.propose([])
        self.env = {
            "PATH": str(self.bin) + os.pathsep + os.defpath,
            "HOME": str(self.home), "USER_HOME": str(self.home),
            "XDG_CONFIG_HOME": str(self.home / ".config"), "TMPDIR": str(self.work),
            "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1",
            "HTTPS_PROXY": "http://127.0.0.1:9", "HTTP_PROXY": "http://127.0.0.1:9", "NO_PROXY": "",
            "SB_CALLS": str(self.calls_path), "SB_RESPONSE": str(self.response_path),
            "SB_CRON": str(self.cron), "SB_TREE": str(self.tree), "SB_PIN": PIN, "SB_HELP": HELP,
        }

    def save_config(self) -> None:
        self.config_path.write_text(json.dumps(self.config, ensure_ascii=False))

    def propose(self, updates: list[dict]) -> None:
        self.response_path.write_text(json.dumps({"envelope": {
            "type": "result", "subtype": "success", "is_error": False,
            "structured_output": {"updates": updates}, "total_cost_usd": 0.01,
        }}, ensure_ascii=False))

    def update(self, path: str, content: str) -> dict:
        target = self.vault / path
        return {"path": path, "content": content,
                "before_sha256": digest(target.read_bytes()) if target.is_file() else ""}

    def run_script(self, script: str, args: list[str], stdin: str = "") -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(self.scripts / script), *args],
                              input=stdin, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              cwd=self.work, env=self.env, timeout=20, check=False)

    def setup(self, *args: str) -> subprocess.CompletedProcess:
        return self.run_script("setup.py", ["--config", str(self.config_path), "--source", str(self.source), *args])

    def install(self) -> None:
        result = self.setup()
        self.assertEqual(result.returncode, 0, result.stdout)

    def runtime(self, event: str = "scan", payload: dict | None = None) -> subprocess.CompletedProcess:
        return self.run_script("runtime.py", ["--config", str(self.vault / ".second-brain/config.json"), "--event", event],
                               json.dumps(payload, ensure_ascii=False) if payload is not None else "")

    def calls(self, name: str | None = None) -> list[dict]:
        rows = [json.loads(line) for line in self.calls_path.read_text().splitlines()] if self.calls_path.exists() else []
        return [row for row in rows if name is None or row["command"] == name]

    def model_calls(self) -> list[dict]:
        return [row for row in self.calls("claude") if "prompt" in row]

    def raw_bytes(self) -> list[bytes]:
        return sorted(path.read_bytes() for path in (self.vault / "raw").rglob("*") if path.is_file())

    def test_preview_is_read_only_and_invokes_no_external_command(self) -> None:
        before, cron = snapshot(self.work), self.cron.read_bytes()
        result = self.setup("--dry-run")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.work), before)
        self.assertEqual(self.cron.read_bytes(), cron)
        self.assertEqual(self.calls(), [])

    def test_invalid_or_unapproved_config_fails_before_effects(self) -> None:
        cases = []
        for consent in self.config["consent"]:
            cases.append((f"consent-{consent}", ("consent", consent), False))
        cases += [("missing-model", ("model",), ""), ("negative-budget", ("max_run_usd",), -1),
                  ("boolean-budget", ("daily_budget_usd",), True), ("nan-budget", ("max_run_usd",), float("nan")),
                  ("infinite-budget", ("daily_budget_usd",), float("inf")),
                  ("run-exceeds-day", ("max_run_usd",), 9), ("zero-timeout", ("timeout_seconds",), 0),
                  ("cron-newline", ("schedules", "scan"), "* * * * *\nevil"),
                  ("inbox-overlap", ("inbox",), str(self.vault / "raw/sources")),
                  ("vault-is-home", ("vault",), str(self.home))]
        original = json.loads(json.dumps(self.config))
        for label, keys, value in cases:
            with self.subTest(case=label):
                self.config = json.loads(json.dumps(original))
                target = self.config
                for key in keys[:-1]:
                    target = target[key]
                target[keys[-1]] = value
                self.save_config()
                before = snapshot(self.work)
                if label == "consent-download":
                    result = self.run_script("setup.py", ["--config", str(self.config_path)])
                else:
                    result = self.setup()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(snapshot(self.work), before, result.stdout)
        self.config = json.loads(json.dumps(original))
        del self.config["schedules"]
        self.save_config()
        before = snapshot(self.work)
        result = self.setup()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("schedule", result.stdout.lower())
        self.assertEqual(snapshot(self.work), before)
        self.config_path.write_text('{"version":')
        before = snapshot(self.work)
        result = self.setup()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.work), before)

    def test_verified_assets_installed_without_running_upstream_or_model(self) -> None:
        self.install()
        for command in COMMANDS:
            relative = f"commands/obsidian-{command}.md"
            self.assertEqual((self.vault / ".claude" / relative).read_bytes(), (self.source / relative).read_bytes())
        for path in ("raw/sources", "raw/videos", "wiki"):
            self.assertTrue((self.vault / path).is_dir(), path)
        for path in ("index.md", "log.md", "CLAUDE.md"):
            self.assertTrue((self.vault / path).is_file(), path)
        self.assertFalse((self.home / "unsafe-upstream-ran").exists())
        self.assertEqual(self.model_calls(), [])
        self.assertTrue(self.calls("git"), "normal install must authenticate source bytes")
        self.assertTrue(self.inbox.is_dir())
        self.assertEqual((self.vault / "Templates/Fixture.md").read_text(), "# Source template\n{{date}}\n")

    def test_unowned_vault_inbox_and_symlinks_are_not_adopted_or_changed(self) -> None:
        targets = (self.vault, self.vault / "wiki", self.vault / ".second-brain", self.inbox)
        for index, target in enumerate(targets):
            with self.subTest(target=target):
                target.mkdir(parents=True, exist_ok=True)
                sentinel = target / f"authored-{index}.md"
                sentinel.write_text("기존 내용 must survive\n")
                before = snapshot(self.work)
                result = self.setup()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(snapshot(self.work), before, result.stdout)
                sentinel.unlink()
                if target != self.inbox:
                    shutil.rmtree(self.vault)
                else:
                    self.inbox.rmdir()
        outside = self.work / "outside"
        outside.mkdir()
        (outside / "preserve.md").write_text("not owned")
        self.vault.symlink_to(outside, target_is_directory=True)
        before = snapshot(self.work)
        result = self.setup()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.work), before)

    def test_source_tampering_is_rejected_before_install(self) -> None:
        (self.source / "commands/obsidian-ingest.md").write_text("unverified replacement")
        before = snapshot(self.home)
        cron = self.cron.read_bytes()
        result = self.setup()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.home), before)
        self.assertEqual(self.cron.read_bytes(), cron)
        self.assertEqual(self.model_calls(), [])

    def test_owned_rerun_preserves_authored_pages_hooks_home_and_cron(self) -> None:
        global_settings = self.home / ".claude/settings.json"
        global_settings.parent.mkdir()
        global_settings.write_text('{"env":{"keep":"사용자"},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"existing-stop"}]}]}}\n')
        unrelated = self.home / "keep.txt"
        unrelated.write_text("unrelated")
        before_settings = global_settings.read_bytes()
        self.install()
        authored = self.vault / "wiki/authored.md"
        authored.write_text("# Authored\n내가 쓴 내용\n")
        index = self.vault / "index.md"
        index.write_text("# My edited index\n[[wiki/authored]]\n")
        settings = self.vault / ".claude/settings.json"
        data = json.loads(settings.read_text())
        data["unrelated"] = {"keep": "vault 사용자"}
        data.setdefault("hooks", {}).setdefault("Stop", []).append({"hooks": [{"type": "command", "command": "local-stop"}]})
        settings.write_text(json.dumps(data, ensure_ascii=False))
        before = (authored.read_bytes(), index.read_bytes(), self.cron.read_bytes())
        self.install()
        self.assertEqual((authored.read_bytes(), index.read_bytes(), self.cron.read_bytes()), before)
        self.assertEqual(global_settings.read_bytes(), before_settings)
        self.assertEqual(unrelated.read_text(), "unrelated")
        self.assertEqual(json.loads(settings.read_text())["unrelated"], {"keep": "vault 사용자"})
        commands = [hook["command"] for group in json.loads(settings.read_text())["hooks"]["PostCompact"] for hook in group["hooks"]]
        self.assertEqual(len(commands), 1, commands)
        self.assertIn("local-stop", [hook["command"] for group in json.loads(settings.read_text())["hooks"]["Stop"] for hook in group["hooks"]])

    def test_installed_scan_captures_original_rewrites_unicode_and_deduplicates(self) -> None:
        self.install()
        original = "# 원본\n서울의 café: naïve 🧠\n".encode()
        arrival = self.inbox / "소스 자료.md"
        arrival.write_bytes(original)
        old_page = self.vault / "wiki/knowledge.md"
        old_page.write_text("# Prior\nold claim\n")
        content = "# Reconciled\n서울의 café 🧠: revised claim\n"
        self.propose([self.update("wiki/knowledge.md", content)])
        result = self.runtime()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(old_page.read_text(), content)
        self.assertEqual(arrival.read_bytes(), original)
        self.assertIn(original, self.raw_bytes())
        first_raw = snapshot(self.vault / "raw")
        prompt = json.loads(self.model_calls()[0]["prompt"].splitlines()[-1])
        self.assertIn(original.decode(), [row["content"] for row in prompt["sources"]])
        self.assertIn(digest(original), [row["sha256"] for row in prompt["sources"]])
        result = self.runtime()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(len(self.model_calls()), 1)
        self.assertEqual(snapshot(self.vault / "raw"), first_raw)
        self.assertEqual(self.calls("graphify"), [], "ordinary ingestion must not rebuild Graphify")

    def test_invalid_proposal_is_atomic_and_original_remains_retryable(self) -> None:
        self.install()
        original = b"immutable pending source\n"
        arrival = self.inbox / "pending.md"
        arrival.write_bytes(original)
        page = self.vault / "wiki/keep.md"
        page.write_text("authoritative old claim\n")
        (self.vault / "wiki/stale.md").write_text("newer human revision\n")
        valid = self.update("wiki/keep.md", "must not partially commit\n")
        cases = {
            "raw": {"path": "raw/videos/delete.md", "content": "bad", "before_sha256": ""},
            "traversal": {"path": "wiki/../../escape.md", "content": "bad", "before_sha256": ""},
            "absolute": {"path": str(self.work / "escape.md"), "content": "bad", "before_sha256": ""},
            "stale-base": {"path": "wiki/stale.md", "content": "bad", "before_sha256": "a" * 64},
            "bad-content": {"path": "wiki/new.md", "content": 123, "before_sha256": ""},
            "duplicate": dict(valid),
        }
        before_pages = snapshot(self.vault / "wiki")
        for label, hostile in cases.items():
            with self.subTest(case=label):
                self.propose([valid, hostile])
                result = self.runtime()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(snapshot(self.vault / "wiki"), before_pages)
                self.assertEqual(arrival.read_bytes(), original)
                self.assertIn(original, self.raw_bytes())
                self.assertFalse((self.work / "escape.md").exists())
        self.propose([self.update("wiki/keep.md", "recovered\n")])
        result = self.runtime()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(page.read_text(), "recovered\n")
        self.assertEqual(self.raw_bytes().count(original), 1)

    def test_malformed_nonzero_and_timeout_failures_surface_and_preserve_input(self) -> None:
        self.install()
        arrival = self.inbox / "failure.md"
        arrival.write_text("source survives every external failure\n")
        before_wiki = snapshot(self.vault / "wiki")
        for label, control in (("malformed", {"raw": "not JSON"}), ("nonzero", {"exit": 27}), ("timeout", {"block": True})):
            with self.subTest(case=label):
                if label == "timeout":
                    path = self.vault / ".second-brain/config.json"
                    config = json.loads(path.read_text())
                    config["timeout_seconds"] = 2
                    path.write_text(json.dumps(config))
                self.response_path.write_text(json.dumps(control))
                result = self.runtime()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertTrue(result.stdout.strip(), "failure must be visible to unattended operators")
                self.assertEqual(snapshot(self.vault / "wiki"), before_wiki)
                self.assertEqual(arrival.read_text(), "source survives every external failure\n")
        self.propose([self.update("wiki/recovered.md", "retry succeeds\n")])
        result = self.runtime()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual((self.vault / "wiki/recovered.md").read_text(), "retry succeeds\n")

    def test_daily_budget_blocks_second_invocation_after_failed_reserved_call(self) -> None:
        self.config["daily_budget_usd"] = self.config["max_run_usd"]
        self.save_config()
        self.install()
        arrival = self.inbox / "budget.md"
        arrival.write_text("retry must remain pending\n")
        self.response_path.write_text(json.dumps({"exit": 27}))
        failed = self.runtime()
        self.assertNotEqual(failed.returncode, 0, failed.stdout)
        self.assertEqual(len(self.model_calls()), 1)
        before = snapshot(self.vault / "wiki")
        self.propose([self.update("wiki/budget.md", "unfunded write\n")])
        exhausted = self.runtime()
        self.assertNotEqual(exhausted.returncode, 0, exhausted.stdout)
        self.assertRegex(exhausted.stdout.lower(), r"(budget|allowance).*exhaust")
        self.assertEqual(len(self.model_calls()), 1)
        self.assertEqual(snapshot(self.vault / "wiki"), before)
        self.assertEqual(arrival.read_text(), "retry must remain pending\n")
        self.assertIn(arrival.read_bytes(), self.raw_bytes())

    def test_symlink_wiki_proposal_cannot_write_outside_vault(self) -> None:
        self.install()
        outside = self.work / "outside"
        outside.mkdir()
        (outside / "note.md").write_text("not the model's file\n")
        (self.vault / "wiki/escape").symlink_to(outside, target_is_directory=True)
        (self.inbox / "incoming.md").write_text("trigger\n")
        self.propose([{"path": "wiki/escape/note.md", "content": "hijacked", "before_sha256": digest((outside / "note.md").read_bytes())}])
        before = snapshot(outside)
        result = self.runtime()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(outside), before)

    def test_postcompact_hook_uses_summary_and_not_transcript_file(self) -> None:
        self.install()
        transcript = self.work / "private-transcript.jsonl"
        transcript.write_text("SECRET NEVER SELECTED BY CONSENT\n")
        self.propose([self.update("wiki/compact.md", "# Summary\n압축된 합의\n")])
        settings = json.loads((self.vault / ".claude/settings.json").read_text())
        commands = [hook["command"] for entry in settings["hooks"]["PostCompact"] for hook in entry["hooks"]]
        self.assertEqual(len(commands), 1)
        payload = json.dumps({"compact_summary": "압축된 합의", "transcript_path": str(transcript), "session_id": "fixture-session"}, ensure_ascii=False)
        result = subprocess.run(["/bin/bash", "-c", commands[0]], input=payload, text=True,
                                cwd=self.vault, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual((self.vault / "wiki/compact.md").read_text(), "# Summary\n압축된 합의\n")
        prompt = self.model_calls()[-1]["prompt"]
        self.assertIn("압축된 합의", prompt)
        self.assertNotIn("SECRET NEVER SELECTED", prompt)
        self.assertNotIn(str(transcript), prompt)
        self.assertNotIn(transcript.read_bytes(), self.raw_bytes())

    def test_registered_schedules_dispatch_each_runtime_event(self) -> None:
        self.install()
        lines = [line for line in self.cron.read_text().splitlines() if line and not line.startswith("#") and "/existing/job" not in line]
        self.assertEqual(len(lines), len(self.config["schedules"]), self.cron.read_text())
        for event, expression in self.config["schedules"].items():
            with self.subTest(event=event):
                matching = [line for line in lines if line.startswith(expression + " ")]
                self.assertEqual(len(matching), 1, self.cron.read_text())
                self.propose([self.update(f"wiki/scheduled-{event}.md", f"executed {event}\n")])
                if event == "scan":
                    (self.inbox / "scheduled-arrival.md").write_text("scheduled source\n")
                shell_command = matching[0].split(None, 5)[5]
                result = subprocess.run(["/bin/bash", "-c", shell_command], cwd=self.work, env=self.env,
                                        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertEqual((self.vault / f"wiki/scheduled-{event}.md").read_text(), f"executed {event}\n")
                self.assertEqual(json.loads(self.model_calls()[-1]["prompt"].splitlines()[-1])["event"], event)
        self.assertIn("17 4 * * * /existing/job # 사용자", self.cron.read_text())


    def test_mixed_inbox_progresses_valid_source_without_marking_rejected_items_processed(self) -> None:
        self.install()
        valid = self.inbox / "valid.md"
        valid.write_text("independent useful source\n")
        binary = self.inbox / "binary.pdf"
        binary.write_bytes(b"%PDF-1.7\n\x00\xff\x80")
        oversized = self.inbox / "oversized.md"
        oversized.write_bytes(b"X" * (self.config["max_input_bytes"] + 1))
        self.propose([self.update("wiki/mixed.md", "valid knowledge progressed\n")])
        for attempt in range(2):
            with self.subTest(attempt=attempt):
                result = self.runtime()
                self.assertNotEqual(result.returncode, 0, "rejected sources must remain visible")
                self.assertEqual((self.vault / "wiki/mixed.md").read_text(), "valid knowledge progressed\n")
                self.assertEqual(len(self.model_calls()), 1, "unchanged valid source must not be sent again")
                self.assertEqual(binary.read_bytes(), b"%PDF-1.7\n\x00\xff\x80")
                self.assertEqual(oversized.read_bytes(), b"X" * (self.config["max_input_bytes"] + 1))
                self.assertIn("binary.pdf", result.stdout)
                self.assertIn("oversized.md", result.stdout)
        state = json.loads((self.vault / ".second-brain/state.json").read_text())
        self.assertEqual(len(state["processed"]), 1)
        self.assertIn(valid.read_bytes(), self.raw_bytes())

    def test_missing_safe_cli_capability_stops_before_model_or_wiki_mutation(self) -> None:
        self.install()
        (self.inbox / "unprocessed.md").write_text("must not reach an unsafe model\n")
        self.env["SB_HELP"] = HELP.replace("--safe-mode", "")
        before = snapshot(self.vault / "wiki")
        result = self.runtime()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("safe", result.stdout.lower())
        self.assertEqual(self.model_calls(), [])
        self.assertEqual(snapshot(self.vault / "wiki"), before)

    def test_postcompact_without_summary_never_treats_transcript_as_input(self) -> None:
        self.install()
        transcript = self.work / "transcript.jsonl"
        transcript.write_text("private transcript is not a compact summary\n")
        result = self.runtime("postcompact", {"transcript_path": str(transcript)})
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.model_calls(), [])
        self.assertNotIn(transcript.read_bytes(), self.raw_bytes())

    def test_standalone_full_install_refuses_missing_config_before_legacy_effects(self) -> None:
        existing = self.home / ".claude/skills/obsidian-second-brain"
        existing.mkdir(parents=True)
        (existing / "authored.md").write_text("existing checkout remains mine\n")
        before = snapshot(self.home)
        result = subprocess.run(["/bin/bash", str(self.scripts / "install.sh")],
                                env=dict(self.env, WITH_UPSTREAM="1", GLOBAL="1", JEO="1"),
                                cwd=self.work, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("JEO_SECOND_BRAIN_CONFIG", result.stdout)
        self.assertEqual(snapshot(self.home), before)
        self.assertEqual(self.calls(), [])

    def raw_fixture(self) -> list[str]:
        originals = ["raw/videos/old.mp4", "raw/audio/old.wav", "raw/sources/old.md",
                     "raw/custom/old.bin", "wiki/archive/roots/legacy/raw/videos/old.mp4",
                     "wiki/archive/roots/legacy/raw/other/old.dat", "Clippings/old.md"]
        for relative in originals:
            path = self.vault / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(("original bytes: " + relative).encode())
            os.utime(path, (946684800, 946684800))
        return originals

    def test_raw_guard_blocks_delete_move_ancestor_and_alias_mutations(self) -> None:
        self.vault.mkdir()
        originals = self.raw_fixture()
        (self.vault / "wiki/video-link").symlink_to(self.vault / "raw/videos", target_is_directory=True)
        driver = self.work / "guard-consumer.py"
        driver.write_text('''import importlib.util, json, os, shutil, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("guard", sys.argv[1])
guard = importlib.util.module_from_spec(spec)
sys.modules["guard"] = guard
spec.loader.exec_module(guard)
vault, action, path = Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
protection = guard.RawGuard(vault)
try:
    protection.check_path(path, action)
    if action == "unlink":
        path.unlink()
    elif action == "move":
        shutil.move(str(path), str(vault / "escaped"))
    else:
        shutil.rmtree(path)
except PermissionError:
    print(json.dumps({"refused": True}))
else:
    print(json.dumps({"refused": False}))
''')
        cases = [("unlink", relative) for relative in originals]
        cases += [("move", "raw/videos"), ("move", "wiki/archive/roots/legacy"),
                  ("rmtree", "raw"), ("rmtree", "wiki/archive"),
                  ("unlink", "wiki/video-link/old.mp4")]
        before = snapshot(self.vault)
        for action, relative in cases:
            with self.subTest(action=action, path=relative):
                result = subprocess.run([sys.executable, str(driver), str(self.scripts / "ctx_guard.py"),
                                         str(self.vault), action, str(self.vault / relative)],
                                        env=self.env, cwd=self.work, text=True, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, timeout=20)
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertEqual(json.loads(result.stdout), {"refused": True})
                self.assertEqual(snapshot(self.vault), before)

    def approve_graphify_provider(self) -> None:
        path = self.vault / ".second-brain/config.json"
        config = json.loads(path.read_text())
        config["consent"]["graphify_provider"] = True
        config["graphify_provider"] = {"backend": "fixture-backend", "model": "fixture-graph-model", "accept_unbounded_cost": True}
        path.write_text(json.dumps(config, ensure_ascii=False))

    def test_checkpoint_requires_separate_graphify_provider_consent(self) -> None:
        self.install()
        self.raw_fixture()
        before = snapshot(self.vault / "raw")
        result = self.runtime("checkpoint")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertRegex(result.stdout.lower(), r"graphify.*(consent|approval|provider)")
        self.assertEqual(self.calls("graphify"), [])
        self.assertEqual(self.model_calls(), [])
        self.assertEqual(snapshot(self.vault / "raw"), before)
        self.approve_graphify_provider()
        result = self.runtime("checkpoint")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual([row["args"][0] for row in self.calls("graphify")], ["update", "cluster-only"])
        self.assertEqual(snapshot(self.vault / "raw"), before)

    def test_checkpoint_retains_stale_raw_in_every_root_without_claude_calls(self) -> None:
        self.install()
        self.approve_graphify_provider()
        originals = self.raw_fixture()
        (self.vault / ".mex").mkdir()
        (self.vault / ".zvec-grep").mkdir()
        before = {path: (self.vault / path).read_bytes() for path in originals}
        for event in ("checkpoint", "checkpoint"):
            result = self.runtime(event)
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertEqual({path: (self.vault / path).read_bytes() for path in originals}, before)
        self.assertEqual(self.model_calls(), [])
        manifest = json.loads((self.vault / ".second-brain/ctx/raw-manifest.json").read_text())
        actual = {entry["path"]: entry["sha256"] for entry in manifest["entries"]}
        self.assertEqual(actual, {path: digest(data) for path, data in before.items()})
        graph = json.loads((self.vault / "graphify-out/graph.json").read_text())
        self.assertEqual({node["id"] for node in graph["nodes"]}, {"live", "meaning"})
        self.assertEqual(graph["links"], [{"source": "live", "target": "meaning"}])
        self.assertEqual([row["args"][1] for row in self.calls("mex-agent")], ["rebuild", "rebuild"])
        self.assertEqual([row["args"][0] for row in self.calls("zg")], ["index", "status", "index", "status"])

    def test_ctx_check_inventories_all_raw_without_writes_or_subprocesses(self) -> None:
        self.install()
        originals = self.raw_fixture()
        before = snapshot(self.work)
        result = self.run_script("ctx_guard.py", ["--config", str(self.vault / ".second-brain/config.json"), "--check"])
        self.assertEqual(result.returncode, 0, result.stdout)
        evidence = json.loads(result.stdout)
        self.assertFalse(evidence["executed"])
        self.assertEqual({entry["path"]: entry["sha256"] for entry in evidence["raw_before"]["entries"]},
                         {path: digest((self.vault / path).read_bytes()) for path in originals})
        self.assertEqual(snapshot(self.work), before)

    def test_checkpoint_rejects_graph_directory_alias_to_raw(self) -> None:
        self.install()
        self.approve_graphify_provider()
        self.raw_fixture()
        (self.vault / "graphify-out").symlink_to(self.vault / "raw/videos", target_is_directory=True)
        before = snapshot(self.vault / "raw")
        result = self.runtime("checkpoint")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.vault / "raw"), before)
        self.assertEqual(self.calls("graphify"), [])

    def test_approved_guide_installs_real_helper_and_rerun_keeps_authored_pages(self) -> None:
        import re
        text = (ROOT / "setup-all-skills-prompt.md").read_text()
        section = text.split("### Knowledge pipeline (second brain + graphify, new vault)", 1)[1]
        block = re.findall(r"```bash\n(.*?)\n```", section, re.S)[0]
        env = dict(self.env, SKILLS_ROOT=str(self.package.parent),
                   JEO_SECOND_BRAIN_CONFIG=str(self.config_path), JEO_SECOND_BRAIN_SOURCE=str(self.source))
        for attempt in range(2):
            result = subprocess.run(["/bin/bash", "-c", block], env=env, cwd=self.work,
                                    text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout)
            page = self.vault / "wiki/guide-user.md"
            if attempt == 0:
                page.write_text("authored after guide activation\n")
                cron = self.cron.read_bytes()
            else:
                self.assertEqual(page.read_text(), "authored after guide activation\n")
                self.assertEqual(self.cron.read_bytes(), cron)
        self.assertEqual(self.model_calls(), [])

    def test_changed_source_keeps_prior_raw_bytes_and_processes_new_version_once(self) -> None:
        self.install()
        source = self.inbox / "versioned.md"
        for version in ("원본 첫째\n", "원본 수정본 🧠\n"):
            source.write_text(version)
            self.propose([self.update("wiki/versioned.md", "current: " + version)])
            result = self.runtime()
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertEqual((self.vault / "wiki/versioned.md").read_text(), "current: " + version)
        self.assertEqual(len(self.model_calls()), 2)
        self.assertIn("원본 첫째\n".encode(), self.raw_bytes())
        self.assertIn("원본 수정본 🧠\n".encode(), self.raw_bytes())
        before = snapshot(self.vault / "raw")
        result = self.runtime()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(len(self.model_calls()), 2)
        self.assertEqual(snapshot(self.vault / "raw"), before)

    def test_setup_refuses_symlinked_config_and_inbox_before_effects(self) -> None:
        config_target = self.work / "real-approved.json"
        self.config_path.rename(config_target)
        self.config_path.symlink_to(config_target)
        before = snapshot(self.work)
        result = self.setup()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.work), before)
        self.config_path.unlink()
        config_target.rename(self.config_path)
        outside = self.work / "outside-inbox"
        outside.mkdir()
        (outside / "authored.md").write_text("not adopted\n")
        self.inbox.symlink_to(outside, target_is_directory=True)
        before = snapshot(self.work)
        result = self.setup()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.work), before)

    def test_valid_config_cannot_override_explicit_installer_veto(self) -> None:
        for flag in ("JEO_SKILLS_APPROVE_KNOWLEDGE_HOOKS", "JEO_SKILLS_APPROVE_KNOWLEDGE_DATA"):
            with self.subTest(flag=flag):
                self.env[flag] = "false"
                before = snapshot(self.work)
                result = self.setup()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(snapshot(self.work), before)
                del self.env[flag]

    def test_full_prompt_overhead_cannot_starve_later_small_source(self) -> None:
        self.install()
        too_large = self.inbox / "000.md"
        too_large.write_bytes(b"x" * self.config["max_input_bytes"])
        small = self.inbox / "later-valid.md"
        small.write_text("small independent source\n")
        self.propose([self.update("wiki/small.md", "small source processed\n")])
        for attempt in range(2):
            with self.subTest(attempt=attempt):
                result = self.runtime()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn("000.md", result.stdout)
                self.assertEqual((self.vault / "wiki/small.md").read_text(), "small source processed\n")
                self.assertEqual(len(self.model_calls()), 1)
                self.assertEqual(too_large.read_bytes(), b"x" * self.config["max_input_bytes"])
        state = json.loads((self.vault / ".second-brain/state.json").read_text())
        self.assertEqual(len(state["processed"]), 1)

    def test_owned_rerun_rejects_changed_verified_upstream_before_effects(self) -> None:
        self.install()
        pristine = self.vault / ".second-brain/upstream/commands/obsidian-ingest.md"
        pristine.write_text("tampered provider instruction\n")
        before = (snapshot(self.home), snapshot(self.inbox), self.cron.read_bytes())
        result = self.setup()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual((snapshot(self.home), snapshot(self.inbox), self.cron.read_bytes()), before)
        self.assertEqual(self.model_calls(), [])

    def test_case_alias_inbox_config_rejected_before_provider_or_capture(self) -> None:
        self.install()
        path = self.vault / ".second-brain/config.json"
        original = json.loads(path.read_text())
        for spelling in ("WIKI", "Raw", ".SECOND-BRAIN"):
            with self.subTest(spelling=spelling):
                inbox = self.vault / spelling / "alias-inbox"
                inbox.mkdir(parents=True, exist_ok=True)
                (inbox / "private.md").write_text("must not be submitted\n")
                config = dict(original, inbox=str(inbox))
                path.write_text(json.dumps(config))
                before = snapshot(self.work)
                result = self.runtime()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(self.model_calls(), [])
                self.assertEqual(snapshot(self.work), before)

    def test_installed_scheduled_scan_honors_revocation_without_disabling_manual_scan(self) -> None:
        self.install()
        source = self.inbox / "revoked-schedule.md"
        source.write_text("manual processing remains separately authorized\n")
        path = self.vault / ".second-brain/config.json"
        config = json.loads(path.read_text())
        config["consent"]["schedule"] = False
        path.write_text(json.dumps(config, ensure_ascii=False))
        before_raw = snapshot(self.vault / "raw")
        before_wiki = snapshot(self.vault / "wiki")
        state_path = self.vault / ".second-brain/state.json"
        before_state = state_path.read_bytes() if state_path.exists() else None
        expression = self.config["schedules"]["scan"]
        line = next(line for line in self.cron.read_text().splitlines() if line.startswith(expression + " "))
        result = subprocess.run(["/bin/bash", "-c", line.split(None, 5)[5]], env=self.env,
                                cwd=self.work, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.model_calls(), [])
        self.assertEqual(snapshot(self.vault / "raw"), before_raw)
        self.assertEqual(snapshot(self.vault / "wiki"), before_wiki)
        self.assertEqual(state_path.read_bytes() if state_path.exists() else None, before_state)
        diagnostic = result.stdout + "\n".join(log.read_text() for log in (self.vault / ".second-brain").rglob("*.log"))
        self.assertIn("schedule", diagnostic.lower())
        self.propose([self.update("wiki/manual.md", "manual authorization honored\n")])
        result = self.runtime()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual((self.vault / "wiki/manual.md").read_text(), "manual authorization honored\n")
        self.assertEqual(len(self.model_calls()), 1)
        self.assertIn(source.read_bytes(), self.raw_bytes())

if __name__ == "__main__":
    unittest.main()
