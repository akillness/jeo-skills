#!/usr/bin/env python3
"""Offline host turn regression tests; all state is under temporary directories."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import shutil
import shlex
import socket
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / ".agent-skills/zvec-grep/scripts"


def load_events():
    spec = importlib.util.spec_from_file_location("zvec_host_events", SCRIPTS / "host-events.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HostEventBehavior(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="zvec-hook-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.home = self.base / "home"
        self.home.mkdir()
        self.root = self.base / "workspace with spaces"
        self.root.mkdir()
        self.state = self.base / "state"
        self.file = self.root / "source.txt"
        self.file.write_text("original\n")
        self.events = load_events()
        self.requests = []
        scanner = patch.object(self.events, "snapshot", side_effect=self.fixture_snapshot)
        scanner.start()
        self.addCleanup(scanner.stop)

    def fixture_snapshot(self, root):
        return {str(path): path.read_bytes().hex()
                for path in Path(root).rglob("*")
                if path.is_file() and ".zvec-grep" not in path.relative_to(root).parts}

    def request(self, *args, **kwargs):
        self.requests.append((args, kwargs))

    def indexed(self):
        index = self.root / ".zvec-grep"
        index.mkdir()
        (index / "manifest.json").write_text(json.dumps({"indexPolicy": "enabled", "embedding": {"provider": "fake"}}))
        (index / "files.zvec").mkdir()

    def begin(self, session="session"):
        with patch.object(self.events, "managed_post", side_effect=lambda root, endpoint, payload:
                          {"status": "trusted", "registered": True, "root": str(root)}):
            self.events.begin(self.root, session, self.state)

    def finish(self, session="session"):
        self.events.finish(self.root, session, self.state, self.request)

    def test_read_only_turn_does_not_request_refresh(self):
        self.indexed()
        self.begin()
        self.file.read_text()
        self.finish()
        self.assertEqual(self.requests, [])

    def test_edited_file_requests_refresh(self):
        self.indexed()
        self.begin()
        self.file.write_text("changed\n")
        self.finish()
        self.assertEqual(self.requests, [((self.root.resolve(), [str(self.file.resolve())]), {})])

    def test_shell_create_rename_and_delete_are_detected(self):
        self.indexed()
        for index, (command, names) in enumerate((
            ("printf 'new' > created.txt", ["created.txt"]),
            ("mv created.txt renamed.txt", ["created.txt", "renamed.txt"]),
            ("rm renamed.txt", ["renamed.txt"]),
        )):
            with self.subTest(command=command):
                session = f"shell-{index}"
                self.begin(session)
                subprocess.run(["/bin/sh", "-c", command], cwd=self.root, check=True,
                               env={"HOME": str(self.home), "PATH": os.defpath})
                before = len(self.requests)
                self.finish(session)
                self.assertEqual(len(self.requests), before + 1)
                self.assertEqual(self.requests[-1],
                                 ((self.root.resolve(), [str(self.root.resolve() / name) for name in names]), {}))

    def test_missing_index_never_created_or_refreshed(self):
        self.begin()
        self.file.write_text("changed\n")
        self.finish()
        self.assertEqual(self.requests, [])
        self.assertFalse((self.root / ".zvec-grep").exists())

    def test_concurrent_session_callbacks_keep_each_turn(self):
        self.indexed()
        for session in ("alpha", "beta"):
            self.begin(session)
        self.file.write_text("changed by a shell or editor\n")
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(self.finish, ("alpha", "beta")))
        self.assertEqual(len(self.requests), 2)

    def test_duplicate_concurrent_end_does_not_refresh_twice(self):
        self.indexed()
        self.begin()
        self.file.write_text("changed\n")
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(self.finish, ("session", "session")))
        self.assertEqual(len(self.requests), 1)


    def test_non_object_callback_payload_does_not_fail_host_turn(self):
        for payload in ("null", "[]", '"unexpected"'):
            with self.subTest(payload=payload):
                result = subprocess.run([sys.executable, str(SCRIPTS / "host-events.py"), "start"],
                                        input=payload, cwd=self.base, capture_output=True, text=True,
                                        env={"HOME": str(self.home), "PATH": os.defpath,
                                             "PYTHONDONTWRITEBYTECODE": "1"}, timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertFalse((self.root / ".zvec-grep").exists())

    def test_preview_preserves_existing_host_configuration(self):
        config = self.home / ".claude/settings.json"
        config.parent.mkdir(parents=True)
        original = '{"hooks":{"Stop":[{"matcher":"","hooks":[]}]},"other":"preserve"}\n'
        config.write_text(original)
        result = subprocess.run([sys.executable, str(SCRIPTS / "host-install.py"),
                                 "--home", str(self.home)],
                                env={"HOME": str(self.home), "PATH": os.defpath,
                                     "PYTHONDONTWRITEBYTECODE": "1"},
                                cwd=self.base, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(config.read_text(), original)
        self.assertFalse((self.root / ".zvec-grep").exists())
        unsupported = json.loads(result.stdout)["unsupported_or_unverified"]
        self.assertTrue({"jeo", "gjc", "standalone agy"}.issubset(unsupported))

    def test_preview_reports_all_unsupported_or_unverified_hosts(self):
        result = subprocess.run([sys.executable, str(SCRIPTS / "host-install.py"),
                                 "--home", str(self.home)],
                                cwd=self.base, capture_output=True, text=True, timeout=15,
                                env={"HOME": str(self.home), "PATH": os.defpath,
                                     "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue({"opencode", "jeo", "gjc", "standalone agy", "qwen"}
                        .issubset(report["unsupported_or_unverified"]))
        self.assertFalse({"opencode", "jeo", "gjc", "standalone agy", "qwen"}
                         .intersection(change["host"] for change in report["changes"]))

    def test_unsupported_targets_reject_without_modifying_configurations(self):
        configs = [self.home / ".claude/settings.json", self.home / ".gemini/settings.json"]
        for config in configs:
            config.parent.mkdir(parents=True)
            config.write_text('{"hooks":{"Stop":[]},"user":"preserve"}\n')
        before = {path.relative_to(self.home): path.read_bytes()
                  for path in self.home.rglob("*") if path.is_file()}
        for host in ("opencode", "jeo", "gjc", "standalone agy", "agy", "qwen"):
            with self.subTest(host=host):
                result = subprocess.run([sys.executable, str(SCRIPTS / "host-install.py"),
                                         "--home", str(self.home), "--target", "claude",
                                         "--target", host, "--apply"],
                                        cwd=self.base, capture_output=True, text=True, timeout=15,
                                        env={"HOME": str(self.home), "PATH": os.defpath,
                                             "PYTHONDONTWRITEBYTECODE": "1"})
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("invalid choice", result.stderr)
                self.assertIn(host, result.stderr)
                after = {path.relative_to(self.home): path.read_bytes()
                         for path in self.home.rglob("*") if path.is_file()}
                self.assertEqual(after, before)
                self.assertFalse((self.root / ".zvec-grep").exists())

    def test_apply_preserves_existing_settings_and_hooks(self):
        for host in ("claude", "gemini", "codex"):
            with self.subTest(host=host):
                config = self.home / f".{host}/{'hooks.json' if host == 'codex' else 'settings.json'}"
                config.parent.mkdir(parents=True)
                original_hook = {"hooks": [{"type": "command", "command": "existing-hook"}]}
                event = "AfterAgent" if host == "gemini" else "Stop"
                config.write_text(json.dumps({"other": {"keep": True}, "hooks": {event: [original_hook]}}))
                command = [sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(self.home),
                           "--target", host, "--apply"]
                for _ in range(2):
                    result = subprocess.run(command, cwd=self.base, capture_output=True, text=True,
                                            env={"HOME": str(self.home), "PATH": os.defpath,
                                                 "PYTHONDONTWRITEBYTECODE": "1"}, timeout=15)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                updated = json.loads(config.read_text())
                self.assertEqual(updated["other"], {"keep": True})
                self.assertEqual(updated["hooks"][event][0], original_hook)
                self.assertEqual(len(updated["hooks"][event]), 2)

    def test_codex_preview_migration_and_hook_response(self):
        config = self.home / '.codex/hooks.json'
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({'other': 'preserved', 'hooks': {'Stop': []}}))
        env = {'HOME': str(self.home), 'PATH': os.defpath, 'PYTHONDONTWRITEBYTECODE': '1'}
        command = [sys.executable, str(SCRIPTS / 'host-install.py'), '--home', str(self.home), '--target', 'codex']
        original = config.read_bytes()
        preview = subprocess.run(command, cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertEqual(config.read_bytes(), original)
        self.assertEqual([c['host'] for c in json.loads(preview.stdout)['changes']], ['codex'])
        applied = subprocess.run(command + ['--apply'], cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
        self.assertEqual(applied.returncode, 0, applied.stderr)
        data = json.loads(config.read_text())
        self.assertEqual(data['other'], 'preserved')
        for event in ('UserPromptSubmit', 'Stop'):
            entry = data['hooks'][event][0]
            new = entry['hooks'][0]['command']
            self.assertTrue(new.endswith(" ; printf '{}'"))
            old = {'hooks': [{'type': 'command', 'command': new.removesuffix(" ; printf '{}'")}]}
            data['hooks'][event].insert(0, old)
        config.write_text(json.dumps(data))
        for _ in range(2):
            applied = subprocess.run(command + ['--apply'], cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
            self.assertEqual(applied.returncode, 0, applied.stderr)
            data = json.loads(config.read_text())
            for event in ('UserPromptSubmit', 'Stop'):
                self.assertEqual(len(data['hooks'][event]), 1)
                hook = data['hooks'][event][0]['hooks'][0]['command']
                result = subprocess.run(['/bin/sh', '-c', hook], cwd=self.base, env=env,
                                        input=json.dumps({'cwd': str(self.root), 'session_id': 'codex-fixture'}),
                                        capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout), {})
        before = config.read_bytes()
        rejected = subprocess.run(command + ['--warnings-dir', str(self.base / 'other'), '--apply'],
                                  cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(config.read_bytes(), before)

    def test_warning_directory_relocation_rejects_all_selected_targets(self):
        for host, other, event in (("claude", "gemini", "Stop"),
                                   ("gemini", "claude", "AfterAgent")):
            with self.subTest(host=host):
                home = self.base / f"relocation-{host}"
                home.mkdir()
                config = home / f".{host}/settings.json"
                other_config = home / f".{other}/settings.json"
                other_config.parent.mkdir(parents=True)
                other_config.write_text('{"user":"keep unchanged"}\n')
                env = {"HOME": str(home), "PATH": os.defpath, "PYTHONDONTWRITEBYTECODE": "1"}
                command = [sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(home),
                           "--target", host, "--warnings-dir", str(self.base / "original warnings"), "--apply"]
                result = subprocess.run(command, cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                data = json.loads(config.read_text())
                managed = data["hooks"][event][0]["hooks"][0]["command"]
                unrelated = {"hooks": [{"type": "command", "command": managed.replace(" end || true", " end --user-option || true")}]}
                self.assertNotEqual(unrelated["hooks"][0]["command"], managed)
                data["hooks"][event].append(unrelated)
                config.write_text(json.dumps(data))
                result = subprocess.run(command, cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(unrelated, json.loads(config.read_text())["hooks"][event])
                before = {path: path.read_bytes() for path in (config, other_config)}
                command = [sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(home),
                           "--target", host, "--target", other, "--warnings-dir", str(self.base / "new warnings"), "--apply"]
                result = subprocess.run(command, cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                for path, original in before.items():
                    self.assertEqual(path.read_bytes(), original)

    def test_recognized_legacy_hooks_migrate_without_disturbing_other_hooks(self):
        warnings = self.base / "fixed warnings 'directory'"
        injected = self.base / "injected"
        capture = self.base / "migration-captures.jsonl"
        bin_dir = self.base / "migration-bin"
        bin_dir.mkdir()
        python = bin_dir / "python3"
        python.write_text(f"#!{sys.executable}\nimport json, os, sys\n"
                          "with open(os.environ['CAPTURE'], 'a') as out:\n"
                          "    out.write(json.dumps([sys.argv[1:], os.environ.get('ZVEC_GREP_MANAGED_WARNINGS_DIR')]) + '\\n')\n")
        python.chmod(0o700)
        env = {"HOME": str(self.home), "PATH": str(bin_dir) + os.pathsep + os.defpath,
               "PYTHONDONTWRITEBYTECODE": "1", "CAPTURE": str(capture),
               "ZVEC_GREP_MANAGED_WARNINGS_DIR": str(injected)}
        bridge = shlex.quote(str(SCRIPTS / "host-events.py"))
        for host, events in (("claude", (("UserPromptSubmit", "start"), ("Stop", "end"))),
                             ("gemini", (("BeforeAgent", "start"), ("AfterAgent", "end")))):
            for legacy in ("bare", "shell"):
                with self.subTest(host=host, legacy=legacy):
                    config = self.home / f".{host}/settings.json"
                    config.parent.mkdir(parents=True, exist_ok=True)
                    original = {"other": {"keep": True}, "hooks": {"OtherEvent": [{"keep": 1}]}}
                    for event, phase in events:
                        old = f"python3 {bridge} {phase}"
                        if legacy == "shell":
                            old = f"test ! -f {bridge} || python3 {bridge} {phase} || true"
                        other = {"hooks": [{"type": "command", "command": old + " --user-option"}]}
                        original["hooks"][event] = [other, {"hooks": [{"type": "command", "command": old}]}]
                    config.write_text(json.dumps(original))
                    command = [sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(self.home),
                               "--target", host, "--warnings-dir", str(warnings), "--apply"]
                    for attempt in range(2):
                        result = subprocess.run(command, cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                        updated = json.loads(config.read_text())
                        if attempt == 0:
                            first = updated
                        else:
                            self.assertEqual(updated, first)
                    self.assertEqual(updated["other"], original["other"])
                    self.assertEqual(updated["hooks"]["OtherEvent"], original["hooks"]["OtherEvent"])
                    for event, phase in events:
                        entries = updated["hooks"][event]
                        self.assertEqual(len(entries), 2)
                        self.assertEqual(entries[0], original["hooks"][event][0])
                        migrated = entries[1]["hooks"][0]["command"]
                        result = subprocess.run(["/bin/sh", "-c", migrated], input="{}", cwd=self.base,
                                                env=env, capture_output=True, text=True, timeout=15)
                        self.assertEqual(result.returncode, 0, result.stderr)
                    records = [json.loads(line) for line in capture.read_text().splitlines()]
                    self.assertEqual([record[0][-1] for record in records[-2:]], ["start", "end"])
                    self.assertEqual([record[1] for record in records[-2:]], [str(warnings)] * 2)

    def test_extension_conflict_prevents_hook_migration_and_preserves_user_file(self):
        config = self.home / ".claude/settings.json"
        config.parent.mkdir(parents=True)
        bridge = shlex.quote(str(SCRIPTS / "host-events.py"))
        original = json.dumps({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": f"python3 {bridge} end"}]}]}})
        config.write_text(original)
        extension = self.home / ".pi/agent/extensions/zvec-grep-response.ts"
        extension.parent.mkdir(parents=True)
        extension.write_text("// user modified extension\n")
        result = subprocess.run([sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(self.home),
                                 "--target", "claude", "--target", "pi", "--warnings-dir", str(self.base / "fixed"), "--apply"],
                                cwd=self.base, env={"HOME": str(self.home), "PATH": os.defpath,
                                                    "PYTHONDONTWRITEBYTECODE": "1"},
                                capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing to overwrite", result.stderr)
        self.assertEqual(config.read_text(), original)
        self.assertEqual(extension.read_text(), "// user modified extension\n")

    def test_explicit_warning_directory_is_bound_to_every_host_callback(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is required to exercise extension callbacks")
        warnings = self.base / "daemon warnings 'fixed'"
        daemon_home = self.base / "daemon home 'fixed'"
        inherited_home = self.base / "inherited daemon home"
        injected = self.base / "callback-controlled"
        captures = self.base / "captures.jsonl"
        bin_dir = self.base / "bin"
        bin_dir.mkdir()
        fake_python = bin_dir / "python3"
        fake_python.write_text(f"#!{sys.executable}\nimport json, os, sys\n"
                               "with open(os.environ['CAPTURES'], 'a') as out:\n"
                               "    out.write(json.dumps({'args': sys.argv[1:], 'warnings': os.environ.get('ZVEC_GREP_MANAGED_WARNINGS_DIR'), 'home': os.environ.get('ZVEC_GREP_HOME'), 'input': sys.stdin.read()}) + '\\n')\n")
        fake_python.chmod(0o700)
        env = {"HOME": str(self.home), "PATH": str(bin_dir) + os.pathsep + os.defpath,
               "PYTHONDONTWRITEBYTECODE": "1", "CAPTURES": str(captures),
               "ZVEC_GREP_MANAGED_WARNINGS_DIR": str(injected), "ZVEC_GREP_HOME": str(inherited_home)}
        for host, event in (("claude", "Stop"), ("gemini", "AfterAgent")):
            config = self.home / f".{host}/settings.json"
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps({"other": {"keep": True}, "hooks": {event: [{"hooks": [{"type": "command", "command": "existing-hook"}]}]}}))
        for host in ("pi", "omp", "jeopi"):
            other = self.home / f".{host}/agent/extensions/other.ts"
            other.parent.mkdir(parents=True)
            other.write_text("existing extension\n")
        command = [sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(self.home),
                   "--warnings-dir", str(warnings), "--daemon-home", str(daemon_home), "--apply"]
        for host in ("claude", "gemini", "pi", "omp", "jeopi"):
            command.extend(["--target", host])
        for _ in range(2):
            result = subprocess.run(command, cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.dumps({"cwd": str(self.root), "session_id": "session", "env": {
            "ZVEC_GREP_MANAGED_WARNINGS_DIR": str(injected), "ZVEC_GREP_HOME": str(inherited_home)}})
        for host, phases in (("claude", (("UserPromptSubmit", "start"), ("Stop", "end"))),
                             ("gemini", (("BeforeAgent", "start"), ("AfterAgent", "end")))):
            config = json.loads((self.home / f".{host}/settings.json").read_text())
            self.assertEqual(config["other"], {"keep": True})
            for event, phase in phases:
                hooks = config["hooks"][event]
                if phase == "end":
                    self.assertEqual(hooks[0]["hooks"][0]["command"], "existing-hook")
                generated = hooks[-1]["hooks"][0]["command"]
                self.assertEqual(len(hooks), 2 if phase == "end" else 1)
                result = subprocess.run(["/bin/sh", "-c", generated], input=payload, cwd=self.base,
                                        env=env, capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stderr)
        runner = '''import { readFile } from "node:fs/promises";
const source = await readFile(process.argv[1], "utf8");
const extension = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const callbacks = {};
extension.default({ on(name, fn) { callbacks[name] = fn; } });
const ctx = { cwd: process.argv[2], sessionManager: { getSessionId: () => "session" } };
await callbacks.before_agent_start({}, ctx);
await callbacks.agent_end({}, ctx);
'''
        for host in ("pi", "omp", "jeopi"):
            directory = self.home / f".{host}/agent/extensions"
            self.assertEqual((directory / "other.ts").read_text(), "existing extension\n")
            result = subprocess.run([node, "--input-type=module", "-e", runner,
                                     str(directory / "zvec-grep-response.ts"), str(self.root)],
                                    cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
        records = [json.loads(line) for line in captures.read_text().splitlines()]
        self.assertEqual([record["args"][-1] for record in records], ["start", "end"] * 5)
        self.assertEqual([record["warnings"] for record in records], [str(warnings)] * 10)
        self.assertEqual([record["home"] for record in records], [str(daemon_home)] * 10)
        self.assertFalse(inherited_home.exists())
        self.assertFalse(injected.exists())

    def test_installer_rejects_relative_warning_directory_without_writing(self):
        config = self.home / ".claude/settings.json"
        config.parent.mkdir(parents=True)
        original = '{"other":"preserve"}\n'
        config.write_text(original)
        result = subprocess.run([sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(self.home),
                                 "--target", "claude", "--warnings-dir", "relative/warnings", "--apply"],
                                cwd=self.base, env={"HOME": str(self.home), "PATH": os.defpath,
                                                   "PYTHONDONTWRITEBYTECODE": "1"},
                                capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("absolute", result.stderr.lower())
        self.assertEqual(config.read_text(), original)
        self.assertFalse((self.base / "relative").exists())

    def test_installer_rejects_relative_daemon_home_without_writing(self):
        config = self.home / ".claude/settings.json"
        config.parent.mkdir(parents=True)
        original = '{"other":"preserve"}\n'
        config.write_text(original)
        result = subprocess.run([sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(self.home),
                                 "--target", "claude", "--target", "pi", "--daemon-home", "relative/daemon", "--apply"],
                                cwd=self.base, env={"HOME": str(self.home), "PATH": os.defpath,
                                                    "PYTHONDONTWRITEBYTECODE": "1"},
                                capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("absolute", result.stderr.lower())
        self.assertEqual(config.read_text(), original)
        self.assertFalse((self.home / ".pi").exists())
        self.assertFalse((self.base / "relative").exists())

    def test_conflicting_daemon_home_rejects_all_targets_before_writing(self):
        for host in ("claude", "gemini", "pi", "omp", "jeopi"):
            with self.subTest(host=host):
                home = self.base / ("home-conflict-" + host)
                home.mkdir()
                env = {"HOME": str(home), "PATH": os.defpath, "PYTHONDONTWRITEBYTECODE": "1"}
                original_home = self.base / "original daemon home"
                common = [sys.executable, str(SCRIPTS / "host-install.py"), "--home", str(home)]
                result = subprocess.run(common + ["--target", host, "--daemon-home", str(original_home), "--apply"],
                                        cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                other = "gemini" if host == "claude" else "claude"
                other_config = home / f".{other}/settings.json"
                other_config.parent.mkdir(parents=True, exist_ok=True)
                other_config.write_text('{"unrelated":"keep"}\n')
                before = {path.relative_to(home): path.read_bytes() if path.is_file() else None for path in home.rglob("*")}
                result = subprocess.run(common + ["--target", other, "--target", host,
                                                 "--daemon-home", str(self.base / "different daemon home"), "--apply"],
                                        cwd=self.base, env=env, capture_output=True, text=True, timeout=15)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                after = {path.relative_to(home): path.read_bytes() if path.is_file() else None for path in home.rglob("*")}
                self.assertEqual(after, before)

    def test_warning_is_private_and_omits_error_contents(self):
        state = self.base / "xdg-state"
        with patch.dict(os.environ, {"HOME": str(self.home), "XDG_STATE_HOME": str(state)}, clear=True):
            self.events.warn(self.root, "snapshot_failed", RuntimeError("secret content"))
        directory = state / "zvec-grep/warnings"
        files = list(directory.glob("*.json"))
        self.assertEqual(len(files), 1)
        self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
        warning = json.loads(files[0].read_text())
        self.assertEqual(warning["code"], "snapshot_failed")
        self.assertEqual(warning["root"], str(self.root.resolve()))
        self.assertNotIn("secret content", files[0].read_text())
        self.assertFalse((self.root / ".zvec-grep").exists())

    def test_warning_rejects_symlink_directory(self):
        target = self.base / "target"
        target.mkdir(mode=0o700)
        link = self.base / "warnings-link"
        link.symlink_to(target, target_is_directory=True)
        output = io.StringIO()
        with patch.dict(os.environ, {"HOME": str(self.home), "ZVEC_GREP_MANAGED_WARNINGS_DIR": str(link)}, clear=True), \
             patch("sys.stderr", output):
            self.events.warn(self.root, "snapshot_failed", RuntimeError("secret"))
        self.assertEqual(list(target.iterdir()), [])
        self.assertIn("warning could not be persisted", output.getvalue())

    def test_warning_rejects_non_private_directory(self):
        for mode in (0o710, 0o701, 0o777):
            with self.subTest(mode=oct(mode)):
                directory = self.base / f"warnings-{mode:o}"
                directory.mkdir(mode=0o700)
                directory.chmod(mode)
                output = io.StringIO()
                with patch.dict(os.environ, {"HOME": str(self.home), "ZVEC_GREP_MANAGED_WARNINGS_DIR": str(directory)}, clear=True), \
                     patch("sys.stderr", output):
                    self.events.warn(self.root, "snapshot_failed", RuntimeError("secret"))
                self.assertEqual(list(directory.iterdir()), [])
                self.assertIn("warning could not be persisted", output.getvalue())

    def test_warning_persists_in_existing_private_directory(self):
        directory = self.base / "private-warnings"
        directory.mkdir(mode=0o700)
        with patch.dict(os.environ, {"HOME": str(self.home), "ZVEC_GREP_MANAGED_WARNINGS_DIR": str(directory)}, clear=True):
            self.events.warn(self.root, "snapshot_failed", RuntimeError("secret"))
        files = list(directory.glob("*.json"))
        self.assertEqual(len(files), 1)
        warning = json.loads(files[0].read_text())
        self.assertEqual((warning["root"], warning["code"]), (str(self.root.resolve()), "snapshot_failed"))
        self.assertNotIn("secret", files[0].read_text())
        self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)

    def test_refresh_large_change_set_requests_content_verification(self):
        calls = []
        def transport(root, endpoint, payload):
            calls.append((root, endpoint, payload))
            return {"status": "accepted"}

        paths = [str(self.root / f"changed-{i}") for i in range(5001)]
        with patch.object(self.events, "managed_post", side_effect=transport):
            self.events.request_refresh(self.root, paths, "reservation-1")
        self.assertEqual(len(calls), 1)
        root, endpoint, payload = calls[0]
        self.assertEqual((root, endpoint), (self.root.resolve(), "refresh"))
        self.assertIs(payload.get("verify_content"), True)
        self.assertEqual(payload.get("reservation_id"), "reservation-1")
        self.assertNotIn("changed_paths", payload)
        self.assertNotIn("force_paths", payload)

    def test_refresh_verifies_socket_identity_before_sending_changes(self):
        short_home = tempfile.TemporaryDirectory(prefix="zg-test-", dir="/tmp")
        self.addCleanup(short_home.cleanup)
        home = Path(short_home.name).resolve()
        daemon = home / ".zvec-grep/daemon"
        daemon.mkdir(parents=True, mode=0o700)
        daemon.chmod(0o700)
        sock = daemon / "managed.sock"
        lock = daemon / "instance.lock"
        warnings = home / "warnings"
        daemon_warnings = home / "daemon-warnings"
        instance = {"managed": True, "ready": True, "managed_api": 1,
                    "managedSocket": str(sock), "pid": 123, "instanceToken": "instance-secret",
                    "warnings_dir": str(warnings)}
        lock.write_text(json.dumps(instance))
        lock.chmod(0o600)
        calls = []
        identity = {"managed": True, "pid": 123, "instance_token": "instance-secret",
                    "os_sandbox": {"remote": "denied"}, "warnings_dir": str(warnings)}
        drop_identity_connection = [False]

        class Connection:
            def __init__(self, path):
                self.sock = object()
                self.path = path
            def request(self, method, path, **kwargs):
                calls.append((method, path, kwargs))
            def getresponse(self):
                if calls[-1][0] == "GET" and drop_identity_connection[0]:
                    self.sock = None
                body = identity if calls[-1][0] == "GET" else {"status": "accepted"}
                return SimpleNamespace(status=200, read=lambda: json.dumps(body).encode(),
                                       getheader=lambda name: "instance-secret")
            def close(self):
                pass

        original_lstat = Path.lstat
        def lstat(path, *args, **kwargs):
            if path == sock:
                return SimpleNamespace(st_mode=stat.S_IFSOCK | 0o600, st_uid=os.getuid())
            return original_lstat(path, *args, **kwargs)

        paths = [str(self.file.resolve())]
        with patch.dict(os.environ, {"HOME": str(home), "ZVEC_GREP_SERVER_TOKEN": "bearer-secret",
                                     "ZVEC_GREP_MANAGED_WARNINGS_DIR": str(warnings)}, clear=True), \
             patch.object(Path, "lstat", lstat), patch.object(self.events.os, "kill"), \
             patch.object(self.events, "UnixConnection", Connection):
            self.events.request_refresh(self.root.resolve(), paths)
            self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity"),
                                                          ("POST", "/managed/refresh")])
            self.assertNotIn("bearer-secret", str(calls))
            self.assertEqual(json.loads(calls[-1][2]["body"])["changed_paths"], paths)
            calls.clear()
            identity["instance_token"] = "wrong"
            with self.assertRaises(ValueError):
                self.events.request_refresh(self.root.resolve(), paths)
            self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity")])
            calls.clear()
            identity["instance_token"] = "instance-secret"
            drop_identity_connection[0] = True
            with self.assertRaises(RuntimeError):
                self.events.request_refresh(self.root.resolve(), paths)
            self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity")])
            drop_identity_connection[0] = False
            for missing in ("identity", "lock"):
                with self.subTest(missing=missing):
                    calls.clear()
                    if missing == "identity":
                        identity.pop("warnings_dir")
                    else:
                        instance.pop("warnings_dir")
                        lock.write_text(json.dumps(instance))
                    with self.assertRaises(ValueError):
                        self.events.request_refresh(self.root.resolve(), paths)
                    self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity")])
                    identity["warnings_dir"] = str(warnings)
                    instance["warnings_dir"] = str(warnings)
                    lock.write_text(json.dumps(instance))

            calls.clear()
            with patch.dict(os.environ, {"ZVEC_GREP_MANAGED_WARNINGS_DIR": "relative/warnings"}):
                with self.assertRaisesRegex(ValueError, "absolute"):
                    self.events.request_refresh(self.root.resolve(), paths)
            self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity")])
            self.assertFalse((self.base / "relative").exists())

            calls.clear()
            identity["warnings_dir"] = str(daemon_warnings)
            instance["warnings_dir"] = str(daemon_warnings)
            lock.write_text(json.dumps(instance))
            with self.assertRaises(ValueError):
                self.events.request_refresh(self.root.resolve(), paths)
            self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity")])
            files = list(daemon_warnings.glob("*.json"))
            self.assertEqual(len(files), 1)
            warning = json.loads(files[0].read_text())
            self.assertEqual((warning["root"], warning["code"]),
                             (str(self.root.resolve()), "warning_directory_mismatch"))
            self.assertFalse(warnings.exists())
            files[0].unlink()
            daemon_warnings.chmod(0o500)
            self.addCleanup(daemon_warnings.chmod, 0o700)
            calls.clear()
            diagnostic = io.StringIO()
            with patch("sys.stderr", diagnostic), self.assertRaises(ValueError):
                self.events.request_refresh(self.root.resolve(), paths)
            self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity")])
            self.assertEqual(list(daemon_warnings.glob("*.json")), [])
            self.assertFalse(warnings.exists())
            self.assertIn("warning could not be persisted", diagnostic.getvalue())

            calls.clear()
            identity["warnings_dir"] = str(warnings)
            with self.assertRaises(ValueError):
                self.events.request_refresh(self.root.resolve(), paths)
            self.assertEqual([call[:2] for call in calls], [("GET", "/managed/identity")])

    def test_reservation_precedes_worker_and_is_released_or_refreshed(self):
        self.indexed()
        for changed in (False, True):
            with self.subTest(changed=changed):
                self.begin("turn")
                if changed:
                    self.file.write_text("new contents\n")
                events = []
                worker = []

                def post(root, endpoint, payload):
                    events.append((endpoint, payload))
                    if endpoint == "reserve":
                        return {"status": "reserved", "reservation_id": "fixture-reservation"}
                    return {"status": "unchanged" if endpoint == "release" else "accepted"}

                def spawn(args, **kwargs):
                    events.append(("spawn", None))
                    worker.extend(args)

                env = {"HOME": str(self.home), "ZVEC_HOOK_STATE_DIR": str(self.state)}
                event = json.dumps({"cwd": str(self.root), "session_id": "turn"})
                with patch.dict(os.environ, env, clear=True), \
                     patch.object(self.events, "managed_post", side_effect=post), \
                     patch.object(self.events.subprocess, "Popen", side_effect=spawn), \
                     patch.object(sys, "argv", ["host-events.py", "end"]), \
                     patch.object(sys, "stdin", io.StringIO(event)):
                    self.assertEqual(self.events.main(), 0)
                self.assertEqual([e[0] for e in events], ["reserve", "spawn"])
                with patch.dict(os.environ, env, clear=True), \
                     patch.object(self.events, "managed_post", side_effect=post), \
                     patch.object(sys, "argv", worker[1:]):
                    self.assertEqual(self.events.main(), 0)
                endpoint, payload = events[-1]
                self.assertEqual(endpoint, "refresh" if changed else "release")
                self.assertEqual(payload["reservation_id"], "fixture-reservation")
                if changed:
                    self.assertEqual(payload["changed_paths"], [str(self.file.resolve())])
                    self.assertEqual(payload["force_paths"], [str(self.file.resolve())])
                else:
                    self.assertEqual(payload["outcome"], "unchanged")

    def drive_hook(self, phase, cwd, posts, fail_reserve=False, fail_refresh=False, untrusted=False):
        worker = []

        def post(root, endpoint, payload):
            posts.append((endpoint, payload))
            if endpoint == "check-root":
                return ({"status": "untrusted", "registered": False} if untrusted else
                        {"status": "trusted", "registered": True, "root": str(root)})
            if endpoint == "reserve":
                if fail_reserve:
                    raise OSError("unavailable")
                return {"status": "reserved", "reservation_id": "reservation"}
            if endpoint == "refresh" and fail_refresh:
                raise OSError("failed request")
            return {"status": "unchanged" if endpoint == "release" else "accepted"}

        env = {"HOME": str(self.home), "XDG_STATE_HOME": str(self.base / "xdg"),
               "ZVEC_HOOK_STATE_DIR": str(self.state)}
        event = json.dumps({"cwd": str(cwd), "session_id": "turn"})
        with patch.dict(os.environ, env, clear=True), \
             patch.object(self.events, "managed_post", side_effect=post), \
             patch.object(self.events.subprocess, "Popen", side_effect=lambda args, **kw: worker.append(args)), \
             patch.object(sys, "argv", ["host-events.py", phase]), \
             patch.object(sys, "stdin", io.StringIO(event)):
            self.assertEqual(self.events.main(), 0)
        for args in worker:
            with patch.dict(os.environ, env, clear=True), \
                 patch.object(self.events, "managed_post", side_effect=post), \
                 patch.object(sys, "argv", args[1:]):
                self.assertEqual(self.events.main(), 0)

    def test_untrusted_workspace_warns_without_scanning_or_baseline(self):
        self.indexed()
        posts = []
        with patch.object(self.events, "snapshot", side_effect=AssertionError("untrusted workspace scanned")):
            self.drive_hook("start", self.root, posts, untrusted=True)
        self.assertEqual([endpoint for endpoint, _ in posts], ["check-root"])
        self.assertFalse(self.state.exists())
        warnings = list((self.base / "xdg/zvec-grep/warnings").glob("*.json"))
        self.assertEqual(len(warnings), 1)
        self.assertEqual(json.loads(warnings[0].read_text())["code"], "hook_failed")

    def test_end_in_second_trusted_workspace_uses_full_verification(self):
        self.indexed()
        other = self.base / "other"
        other.mkdir()
        index = other / ".zvec-grep"
        index.mkdir()
        (index / "manifest.json").write_text(json.dumps({"indexPolicy": "enabled", "embedding": {"provider": "fake"}}))
        (index / "files.zvec").mkdir()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.drive_hook("end", other, posts)
        matches = [payload for endpoint, payload in posts if endpoint == "refresh" and payload["root"] == str(other.resolve())]
        self.assertEqual(len(matches), 1)
        self.assertTrue(matches[0].get("verify_content"))

    def test_end_in_untrusted_second_workspace_never_refreshes_it(self):
        self.indexed()
        other = self.base / "other"
        other.mkdir()
        index = other / ".zvec-grep"
        index.mkdir()
        (index / "manifest.json").write_text(json.dumps({"indexPolicy": "enabled", "embedding": {"provider": "fake"}}))
        (index / "files.zvec").mkdir()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("changed in trusted workspace\n")
        self.drive_hook("end", other, posts, untrusted=True)
        self.assertFalse(any(endpoint in {"reserve", "refresh"} and payload.get("root") == str(other.resolve())
                             for endpoint, payload in posts))
        self.assertNotIn(str(other.resolve()), str(list(self.state.glob("*.json")) and
                                                   [p.read_text() for p in self.state.glob("*.json")]))
        self.assertTrue(any(endpoint == "reserve" and payload.get("root") == str(self.root.resolve())
                            for endpoint, payload in posts))
        self.assertTrue(any(endpoint == "refresh" and payload.get("root") == str(self.root.resolve())
                            and str(self.file.resolve()) in payload.get("changed_paths", [])
                            for endpoint, payload in posts))

    def test_unsafe_state_directory_is_rejected(self):
        self.indexed()
        self.state.mkdir(mode=0o777)
        self.state.chmod(0o777)
        posts = []
        with patch.object(self.events, "snapshot", side_effect=AssertionError("unsafe state scanned")):
            self.drive_hook("start", self.root, posts)
        self.assertEqual(list(self.state.iterdir()), [])
        self.assertTrue(list((self.base / "xdg/zvec-grep/warnings").glob("*.json")))

    def test_missing_vector_index_warns_and_preserves_pending_edit(self):
        self.indexed()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("pending edit\n")
        vectors = self.root / ".zvec-grep/files.zvec"
        relocated = self.base / "vectors"
        vectors.rename(relocated)
        self.drive_hook("end", self.root, posts)
        self.assertFalse(any(endpoint in {"reserve", "refresh"} for endpoint, _ in posts))
        warnings = list((self.base / "xdg/zvec-grep/warnings").glob("*.json"))
        self.assertEqual(json.loads(warnings[0].read_text())["code"], "index_unavailable")
        relocated.rename(vectors)
        self.drive_hook("end", self.root, posts)
        self.assertTrue(any(endpoint == "refresh" and str(self.file.resolve()) in payload["changed_paths"]
                            for endpoint, payload in posts))

    def test_end_from_subdirectory_retains_workspace_changes(self):
        self.indexed()
        subdir = self.root / "subdir"
        subdir.mkdir()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("changed\n")
        self.drive_hook("end", subdir, posts)
        self.assertIn(str(self.file.resolve()), [path for endpoint, payload in posts
                                                if endpoint == "refresh" for path in payload["changed_paths"]])

    def test_nested_index_does_not_change_original_workspace(self):
        self.indexed()
        nested = self.root / "nested"
        nested.mkdir()
        index = nested / ".zvec-grep"
        index.mkdir()
        (index / "manifest.json").write_text(json.dumps({"indexPolicy": "enabled", "embedding": {"provider": "fake"}}))
        (index / "files.zvec").mkdir()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("changed parent\n")
        self.drive_hook("end", nested, posts)
        refreshes = {payload["root"]: payload for endpoint, payload in posts if endpoint == "refresh"}
        self.assertEqual(set(refreshes), {str(self.root.resolve()), str(nested.resolve())})
        self.assertEqual(refreshes[str(self.root.resolve())]["changed_paths"], [str(self.file.resolve())])
        self.assertIs(refreshes[str(nested.resolve())].get("verify_content"), True)

    def test_start_snapshot_timeout_requests_full_content_verification(self):
        self.indexed()
        posts = []
        with patch.object(self.events, "snapshot", side_effect=subprocess.TimeoutExpired("snapshot", 5)):
            self.drive_hook("start", self.root, posts)
        self.file.write_text("edit after timeout\n")
        self.drive_hook("end", self.root, posts)
        refreshes = [payload for endpoint, payload in posts if endpoint == "refresh"]
        self.assertEqual(len(refreshes), 1)
        self.assertIs(refreshes[0].get("verify_content"), True)
        self.assertNotIn("force_paths", refreshes[0])

    def test_end_snapshot_failure_preserves_uncertainty_for_next_turn(self):
        self.indexed()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("edited\n")
        with patch.object(self.events, "snapshot", side_effect=OSError("unreadable")):
            self.drive_hook("end", self.root, posts)
        self.drive_hook("end", self.root, posts)
        refreshes = [payload for endpoint, payload in posts if endpoint == "refresh"]
        self.assertEqual(len(refreshes), 2)
        self.assertTrue(all(payload.get("verify_content") is True for payload in refreshes))

    def test_contention_timeout_preserves_baseline(self):
        self.indexed()
        self.begin()
        self.file.write_text("edit while lock held\n")
        with patch.object(self.events.fcntl, "flock", side_effect=BlockingIOError), \
             patch.object(self.events.time, "monotonic", side_effect=[0, 21]):
            with self.assertRaises(TimeoutError):
                self.finish()
        self.finish()
        self.assertEqual(self.requests, [((self.root.resolve(), [str(self.file.resolve())]), {})])

    def test_existing_baseline_start_avoids_waiting_for_lock(self):
        self.indexed()
        self.begin()
        self.file.write_text("interrupted edit\n")
        with patch.object(self.events, "session_lock", side_effect=AssertionError("start waited for lock")):
            self.begin()
        self.finish()
        self.assertEqual(self.requests, [((self.root.resolve(), [str(self.file.resolve())]), {})])

    def test_missing_or_disabled_index_retains_old_baseline(self):
        self.indexed()
        manifest = self.root / ".zvec-grep/manifest.json"
        original = manifest.read_text()
        for missing in (False, True):
            with self.subTest(missing=missing):
                posts = []
                self.drive_hook("start", self.root, posts)
                self.file.write_text(f"edited while index {missing}\n")
                if missing:
                    manifest.unlink()
                else:
                    manifest.write_text(json.dumps({"indexPolicy": "disabled"}))
                self.drive_hook("end", self.root, posts)
                self.assertFalse(any(endpoint in {"reserve", "refresh"} for endpoint, _ in posts))
                manifest.write_text(original)
                self.drive_hook("start", self.root, posts)
                self.drive_hook("end", self.root, posts)
                self.assertTrue(any(endpoint == "refresh" for endpoint, _ in posts))

    def test_interrupted_turn_edits_survive_next_start(self):
        self.indexed()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("interrupted edit\n")
        self.drive_hook("start", self.root, posts)
        self.drive_hook("end", self.root, posts)
        self.assertTrue(any(endpoint == "refresh" and str(self.file.resolve()) in payload["changed_paths"]
                            for endpoint, payload in posts))

    def test_continued_turn_edits_survive_repeated_end(self):
        self.indexed()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("first edit\n")
        self.drive_hook("end", self.root, posts)
        self.file.write_text("second edit\n")
        self.drive_hook("end", self.root, posts)
        self.assertEqual(sum(endpoint == "refresh" for endpoint, _ in posts), 2)

    def test_failed_reservation_preserves_unsent_edits(self):
        self.indexed()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("unsent edit\n")
        self.drive_hook("end", self.root, posts, fail_reserve=True)
        self.drive_hook("end", self.root, posts)
        self.assertTrue(any(endpoint == "refresh" and str(self.file.resolve()) in payload["changed_paths"]
                            for endpoint, payload in posts))

    def test_failed_refresh_releases_reservation_and_keeps_change(self):
        self.indexed()
        posts = []
        self.drive_hook("start", self.root, posts)
        self.file.write_text("change survives failure\n")
        self.drive_hook("end", self.root, posts, fail_refresh=True)
        self.assertTrue(any(endpoint == "release" and payload.get("outcome") == "failed"
                            for endpoint, payload in posts))
        self.drive_hook("end", self.root, posts)
        self.assertEqual(sum(endpoint == "refresh" for endpoint, _ in posts), 2)

    def test_disabled_index_is_not_scanned_or_refreshed(self):
        self.indexed()
        (self.root / ".zvec-grep/manifest.json").write_text(json.dumps({"indexPolicy": "disabled"}))
        posts = []
        with patch.object(self.events, "snapshot", side_effect=AssertionError("disabled workspace scanned")):
            self.drive_hook("start", self.root, posts)
            self.file.write_text("ignored\n")
            self.drive_hook("end", self.root, posts)
        self.assertEqual(posts, [])
        self.assertFalse((self.base / "xdg/zvec-grep/warnings").exists())

    def test_preview_does_not_disclose_settings_secrets(self):
        config = self.home / ".claude/settings.json"
        config.parent.mkdir(parents=True)
        secret = "fixture-private-token"
        config.write_text(json.dumps({"env": {"SECRET": secret}}))
        result = subprocess.run([sys.executable, str(SCRIPTS / "host-install.py"),
                                 "--home", str(self.home), "--target", "claude"],
                                cwd=self.base, env={"HOME": str(self.home), "PATH": os.defpath},
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(secret, result.stdout + result.stderr)
        self.assertEqual(json.loads(config.read_text())["env"]["SECRET"], secret)

    def test_real_scanner_rejects_external_manifest_root(self):
        zg, node = shutil.which("zg"), shutil.which("node")
        if not zg or not node:
            self.skipTest("installed zg and node are required for scanner integration")
        self.indexed()
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "secret.txt").write_text("secret")
        (self.root / ".zvec-grep/manifest.json").write_text(json.dumps(
            {"id": "test-index", "rootPaths": [str(outside)]}))
        result = subprocess.run([node, str(SCRIPTS / "host-snapshot.mjs"), str(self.root),
                                 str(Path(zg).resolve().parents[2])], cwd=self.base,
                                env={"HOME": str(self.home), "PATH": os.defpath},
                                capture_output=True, text=True, timeout=20)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("secret.txt", result.stdout)

    def test_installed_scanner_detects_same_metadata_edit_and_honors_scope(self):
        zg = shutil.which("zg")
        node = shutil.which("node")
        if not zg or not node:
            self.skipTest("installed zg and node are required for scanner integration")
        package = Path(zg).resolve().parents[2]
        self.indexed()
        manifest = {"id": "test-index", "rootPaths": [{"absolutePath": str(self.root),
                    "recursive": True, "include": ["source.txt"]}]}
        (self.root / ".zvec-grep/manifest.json").write_text(json.dumps(manifest))
        excluded = self.root / "excluded.txt"
        excluded.write_text("outside the indexed selection")
        env = {"HOME": str(self.home), "PATH": os.defpath,
               "PYTHONDONTWRITEBYTECODE": "1"}

        def scan():
            result = subprocess.run([node, str(SCRIPTS / "host-snapshot.mjs"), str(self.root), str(package)],
                                    cwd=self.base, env=env, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            return json.loads(result.stdout)

        before = scan()
        self.assertEqual(set(before), {str(self.file.resolve())})
        info = self.file.stat()
        self.file.write_text("modified\n")
        os.utime(self.file, ns=(info.st_atime_ns, info.st_mtime_ns))
        after = scan()
        self.assertEqual(set(after), {str(self.file.resolve())})
        self.assertEqual(self.file.stat().st_size, info.st_size)
        self.assertEqual(self.file.stat().st_mtime_ns, info.st_mtime_ns)
        self.assertNotEqual(before[str(self.file.resolve())], after[str(self.file.resolve())])


class SnapshotSandboxContainment(unittest.TestCase):
    def test_actual_scanner_stays_inside_workspace_through_symlinks(self):
        if sys.platform != "darwin" or not Path("/usr/bin/sandbox-exec").is_file():
            self.skipTest("macOS sandbox-exec is required")
        zg, node = shutil.which("zg"), shutil.which("node")
        if not zg or not node:
            self.skipTest("installed zg and node are required")
        with tempfile.TemporaryDirectory(prefix="zvec-scanner-test-") as temp:
            base = Path(temp).resolve()
            home, root, outside = (base / name for name in ("home", "workspace", "outside"))
            for directory in (home, root, outside):
                directory.mkdir()
            (root / ".zvec-grep").mkdir()
            (root / "visible.txt").write_text("visible content")
            (outside / "secret.txt").write_text("private outside content")
            (root / "escape").symlink_to(outside, target_is_directory=True)
            manifest = root / ".zvec-grep/manifest.json"
            env = {"HOME": str(home), "PATH": os.defpath}
            package = Path(zg).resolve().parents[2]

            def scan(path):
                manifest.write_text(json.dumps({"id": "test-index", "rootPaths": [
                    {"absolutePath": str(path), "recursive": True}]}))
                return subprocess.run(load_events().snapshot_command(root, package, node),
                                      cwd=base, env=env, capture_output=True, text=True, timeout=20)

            result = scan(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            observed = json.loads(result.stdout)
            self.assertIn(str(root / "visible.txt"), observed)
            self.assertNotIn(str(outside / "secret.txt"), observed)
            result = scan(root / "escape")
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("private outside content", result.stdout + result.stderr)
            self.assertNotIn("secret.txt", result.stdout)

    def test_snapshot_profile_contains_reads_writes_and_network(self):
        if sys.platform != "darwin" or not Path("/usr/bin/sandbox-exec").is_file():
            self.skipTest("macOS sandbox-exec is unavailable")
        node = shutil.which("node")
        if not node:
            self.skipTest("node is required for the sandbox probe")
        node = str(Path(node).resolve())
        with tempfile.TemporaryDirectory(prefix="zvec-sandbox-test-") as temp:
            base = Path(temp).resolve()
            home = base / "home"
            home.mkdir()
            ancestor = base / "ancestor"
            root = ancestor / "workspace"
            sibling = ancestor / "sibling"
            root.mkdir(parents=True)
            sibling.mkdir()
            package = base / "package"
            package.mkdir()
            (root / "visible.txt").write_text("workspace contents")
            (sibling / "secret.txt").write_text("sibling secret")
            (root / "escape").symlink_to(sibling, target_is_directory=True)
            link = base / "ancestor-link"
            link.symlink_to(ancestor, target_is_directory=True)
            env = {"HOME": str(home), "PATH": os.defpath}
            preflight = subprocess.run(
                ["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)", "/usr/bin/true"],
                cwd=base, env=env, capture_output=True, text=True, timeout=10)
            if preflight.returncode:
                self.skipTest("sandbox-exec cannot apply a profile (possibly nested sandbox): "
                              + preflight.stderr.strip())
            command = load_events().snapshot_command(link / "workspace", package, node)
            probe = r'''
const fs = require('fs');
const net = require('net');
const [visible, secret, escaped, output, port] = process.argv.slice(1);
function attempt(fn) {
  try { return {value: fn()}; } catch (err) { return {error: err.code}; }
}
const result = {
  visible: attempt(() => fs.readFileSync(visible, 'utf8')),
  sibling: attempt(() => fs.readFileSync(secret, 'utf8')),
  escaped: attempt(() => fs.readFileSync(escaped, 'utf8')),
  write: attempt(() => fs.writeFileSync(output, 'unwanted')),
};
const client = net.createConnection({host: '127.0.0.1', port: Number(port)});
client.on('connect', () => { result.network = 'connected'; client.destroy(); console.log(JSON.stringify(result)); });
client.on('error', err => { result.network = err.code; console.log(JSON.stringify(result)); });
'''
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                listener.listen(1)
                command = command[:command.index(node) + 1] + [
                    "-e", probe, str(link / "workspace/visible.txt"),
                    str(link / "sibling/secret.txt"), str(root / "escape/secret.txt"), str(root / "forbidden.txt"),
                    str(listener.getsockname()[1])]
                result = subprocess.run(command, cwd=base, env=env, capture_output=True,
                                        text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            observed = json.loads(result.stdout)
            self.assertEqual(observed["visible"], {"value": "workspace contents"})
            self.assertIn(observed["sibling"].get("error"), ("EACCES", "EPERM"), observed)
            self.assertIn(observed["escaped"].get("error"), ("EACCES", "EPERM"), observed)
            self.assertIn(observed["write"].get("error"), ("EACCES", "EPERM"), observed)
            self.assertIn(observed["network"], ("EACCES", "EPERM"), observed)
            self.assertFalse((root / "forbidden.txt").exists())


if __name__ == "__main__":
    unittest.main()
