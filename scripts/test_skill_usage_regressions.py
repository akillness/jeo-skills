#!/usr/bin/env python3
"""Black-box usage collection and read-only pruning regressions.

Run: python3 scripts/test_skill_usage_regressions.py -v
"""

import hashlib
import fcntl
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / ".agent-skills/jeo-skill/scripts/jeo-skill.py"
SECRET = "SECRET_PROMPT_TEXT_DO_NOT_PERSIST"
NOW_OLD = "2026-01-01T00:00:00Z"
NOW_LATE = "2026-01-15T00:00:00Z"
NOW_EXPIRED = "2026-02-05T00:00:00Z"


class SkillUsageRegressions(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jeo-usage-test-")
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.home = self.work / "home"
        self.project = self.work / "project"
        self.state = self.work / "state"
        self.xdg_state = self.work / "xdg-state"
        self.xdg_cache = self.work / "cache"
        for directory in (self.home, self.project, self.state, self.xdg_state, self.xdg_cache):
            directory.mkdir(parents=True)
        self.catalog_path = self.work / "catalog.json"
        self._write_catalog()
        self._write_sources()
        self._install("candidate-old")
        self._install("bundle-skill")
        self.harness = self.work / "jev-harness.py"
        self.harness.write_text(
            "import json, os, sys\n"
            "log = os.environ.get('JEO_HARNESS_LOG')\n"
            "if log:\n"
            "    open(log, 'a', encoding='utf-8').write(json.dumps(sys.argv[1:]) + '\\n')\n"
            "print(json.dumps({'status': 'proposal_only', 'receipt': 'fixture'}))\n",
            encoding="utf-8",
        )
        self.harness.chmod(0o700)
        self.env = {
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "XDG_STATE_HOME": str(self.xdg_state),
            "XDG_CACHE_HOME": str(self.xdg_cache),
            "JEO_SKILL_STATE_DIR": str(self.state),
            "JEO_SKILLS_CATALOG": str(self.catalog_path),
            "JEO_SKILL_JEV_HARNESS": str(self.harness),
            "JEO_HARNESS_LOG": str(self.work / "jev-calls.jsonl"),
            "PYTHONDONTWRITEBYTECODE": "1",
            "JEO_SKILL_NOW": NOW_OLD,
        }

    def cli(self, *args, now=None):
        env = {**self.env}
        if now is not None:
            env["JEO_SKILL_NOW"] = now
        return subprocess.run(
            [sys.executable, str(ROUTER), *args],
            cwd=self.project,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
        )

    def successful(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def _write_catalog(self):
        names = [
            "jeo-skill", "bundle-skill", "claude-skill", "claude-project",
            "codex-skill", "opencode-skill", "gemini-skill", "aside-skill",
            "jeopi-skill", "gjc-skill", "omp-skill", "pi-skill", "jev-skill",
            "candidate-old", "late-skill", "kept-skill", "relevance-skill",
        ]
        catalog = {
            "version": "fixture",
            "categories": {"engineering": [name for name in names]},
            "subcategories": {},
            "bundles": {"starter": ["bundle-skill"]},
            "skills": [
                {
                    "name": name,
                    "category": "engineering",
                    "subcategory": "testing",
                    "description": "usage fixture",
                }
                for name in names
            ],
        }
        self.catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
        self.catalog = catalog
        for name in ("candidate-old", "late-skill"):
            source = self.work / name / "SKILL.md"
            source.parent.mkdir()
            source.write_text(
                f"---\nname: {name}\n---\n# {name.replace('-', ' ').title()}\n",
                encoding="utf-8",
            )

    def _install(self, name):
        root = self.home / ".agents" / "skills" / name
        root.mkdir(parents=True, exist_ok=True)
        root.joinpath("SKILL.md").write_text(
            f"---\nname: {name}\n---\n# {name.replace('-', ' ').title()}\n",
            encoding="utf-8",
        )

    @staticmethod
    def _jsonl(path, rows):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")

    def _write_sources(self):
        self.home.joinpath(".claude.json").write_text(
            json.dumps({
                "skillUsage": {
                    "ns:claude-skill": {"usageCount": 2, "lastUsedAt": 1767225600000},
                    "not-in-catalog": {"usageCount": 99, "lastUsedAt": 1767225600000},
                }
            }),
            encoding="utf-8",
        )
        self._jsonl(
            self.home / ".claude/projects/p/s.jsonl",
            [
                {"role": "assistant", "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": "claude-project"}}]},
                {"role": "user", "content": SECRET + " /h/.agents/skills/claude-project/SKILL.md"},
                {"role": "assistant", "content": [{"type": "tool_use", "name": "Write", "input": {"file_path": "/h/.agents/skills/claude-project/SKILL.md"}}]},
            ],
        )
        codex_commands = [
            {"type": "read", "name": "SKILL.md", "path": "/h/.agents/skills/codex-skill/SKILL.md", "cmd": "cat ..."},
            {"type": "search", "name": "SKILL.md", "path": "/h/.agents/skills/codex-skill/SKILL.md", "cmd": "search"},
            {"type": "unknown", "path": "/h/.agents/skills/codex-skill/SKILL.md", "cmd": SECRET},
        ]
        self._jsonl(
            self.home / ".codex/sessions/2026/10/01/rollout-x.jsonl",
            [
                {"type": "event_msg", "created_at": NOW_OLD, "payload": {"type": "item_completed", "item": {"type": "CommandExecution", "status": "completed", "exit_code": 0, "parsed_cmd": codex_commands}}},
                {"type": "event_msg", "payload": {"type": "item_completed", "item": {"type": "CommandExecution", "status": "completed", "exit_code": 0, "parsed_cmd": [{"type": "read", "path": "/repo/.agent-skills/codex-skill/SKILL.md"}]}}},
                {"type": "event_msg", "payload": {"type": "item_completed", "item": {"type": "CommandExecution", "status": "completed", "exit_code": 1, "parsed_cmd": [{"type": "read", "path": "/h/.agents/skills/codex-skill/SKILL.md"}]}}},
            ],
        )
        opencode = self.home / ".local/share/opencode/opencode.db"
        opencode.parent.mkdir(parents=True)
        db = sqlite3.connect(opencode)
        try:
            db.execute("CREATE TABLE session_message (data TEXT, time_created TEXT)")
            db.executemany(
                "INSERT INTO session_message(data, time_created) VALUES (?, ?)",
                [
                    (json.dumps({"type": "tool", "tool": "read", "state": {"input": {"filePath": "/h/.agents/skills/opencode-skill/SKILL.md"}}}), NOW_OLD),
                    (json.dumps({"type": "tool", "tool": "read", "state": {"input": {"filePath": "/repo/.agent-skills/opencode-skill/SKILL.md"}}}), NOW_OLD),
                    (json.dumps({"type": "tool", "tool": "write", "state": {"input": {"filePath": "/h/.agents/skills/opencode-skill/SKILL.md"}}}), NOW_OLD),
                ],
            )
            db.commit()
        finally:
            db.close()
        gemini_line = {
            "created_at": NOW_OLD,
            "tool_calls": [
                {"name": "view_file", "args": {"AbsolutePath": "/h/.agents/skills/gemini-skill/SKILL.md"}},
                {"name": "write_to_file", "args": {"TargetFile": "/h/.agents/skills/gemini-skill/SKILL.md"}},
                {"name": "view_file", "args": {"AbsolutePath": "/repo/.agent-skills/gemini-skill/SKILL.md"}},
            ],
        }
        transcript = self.home / ".gemini/antigravity-cli/brain/id/.system_generated/logs/transcript.jsonl"
        self._jsonl(transcript, [gemini_line])
        self._jsonl(transcript.parent / "chunks/transcript/00000001.jsonl", [gemini_line])
        self._jsonl(
            self.home / ".aside/u/0/sessions/a.jsonl",
            [
                {"role": "toolResult", "toolName": "read_file", "isError": False, "timestamp": 1767225600000, "details": {"skillName": "aside-skill"}},
                {"role": "toolResult", "toolName": "read_file", "isError": True, "timestamp": 1767225600000, "details": {"skillName": "aside-skill"}},
                {"role": "toolResult", "toolName": "read_file", "isError": False, "timestamp": 1767225600000, "details": {"skillName": SECRET}},
            ],
        )
        for source, name in ((".jeopi", "jeopi-skill"), (".gjc", "gjc-skill"), (".omp", "omp-skill"), (".pi", "pi-skill")):
            self._jsonl(
                self.home / source / "agent/sessions/x/s.jsonl",
                [
                    {"type": "custom_message", "customType": "skill-prompt", "details": {"name": name}},
                    {"type": "message", "message": {"role": "assistant", "content": [{"type": "toolCall", "name": "read", "arguments": {"path": f"skill://{name}"}}]}},
                    {"type": "session_init", "skills": [name, SECRET]},
                    {"type": "message", "message": {"role": "assistant", "content": [{"type": "toolCall", "name": "write", "arguments": {"path": f"/h/.agents/skills/{name}/SKILL.md"}}]}},
                ],
            )
        self.state.mkdir(exist_ok=True)
        self._jsonl(
            self.state / "jev-usage.jsonl",
            [{"v": 1, "at": NOW_OLD, "agent": "fixture", "profile": "off", "routed": ["candidate-old"], "injected": ["jev-skill"], "backend": {"kind": "local", "model": "fixture", "tier": "test"}}],
        )
        self._jsonl(
            self.state / "jev-usage.20261001T000000000Z-1-x.jsonl",
            [{"v": 1, "at": NOW_OLD, "agent": "fixture", "profile": "on", "routed": ["candidate-old"], "injected": ["jev-skill"], "backend": {"kind": "local", "model": "fixture", "tier": "test"}}],
        )
        for ledger in self.state.glob("jev-usage*.jsonl"):
            ledger.chmod(0o600)

    def _report(self, now=NOW_OLD):
        result = self.cli("usage", "report", "--json", now=now)
        self.successful(result)
        return json.loads(result.stdout)

    @staticmethod
    def _rows(report):
        return {row["name"]: row for row in report["skills"]}

    def _snapshot(self):
        return {
            str(path.relative_to(self.work)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in self.work.rglob("*")
            if path.is_file()
        }

    def test_scan_counts_each_source_and_filters_non_load_events(self):
        result = self.cli("usage", "scan", "--json")
        self.successful(result)
        report = self._report()
        rows = self._rows(report)
        expected = {
            "claude-skill": ("claude_skillusage", 2),
            "claude-project": ("claude_projects", 1),
            "codex-skill": ("codex", 1),
            "opencode-skill": ("opencode", 1),
            "gemini-skill": ("gemini", 1),
            "aside-skill": ("aside", 1),
            "jeopi-skill": ("jeopi", 2),
            "gjc-skill": ("gjc", 2),
            "omp-skill": ("omp", 2),
            "pi-skill": ("pi", 2),
            "jev-skill": ("jev", 2),
        }
        for name, (source, count) in expected.items():
            with self.subTest(name=name):
                self.assertEqual(rows[name]["count"], count)
                self.assertEqual(rows[name]["by_source"], {source: count})
        self.assertEqual(rows["claude-skill"]["status"], "used")
        for name in ("candidate-old", "late-skill", "kept-skill", "relevance-skill"):
            self.assertEqual(rows[name]["count"], 0)
        scan = json.loads(result.stdout)
        self.assertEqual(scan["summary"]["used"], len(expected))
        self.assertEqual(scan["sources"]["jev"]["records"], 2)
        state_bytes = b"".join(path.read_bytes() for path in self.state.rglob("*") if path.is_file())
        self.assertNotIn(SECRET.encode(), state_bytes)
        for path in self.state.rglob("*"):
            mode = path.stat().st_mode & 0o777
            self.assertEqual(mode, 0o700 if path.is_dir() else 0o600, path)

    def test_scan_catalog_drift_recomputes_and_retains_usage_evidence(self):
        skill = "claude-project"
        session = self.home / ".claude/projects/p/s.jsonl"
        session_bytes = session.read_bytes()
        reduced_catalog_path = self.work / "catalog-without-claude-project.json"
        reduced_catalog = json.loads(json.dumps(self.catalog))
        reduced_catalog["categories"]["engineering"].remove(skill)
        reduced_catalog["skills"] = [
            item for item in reduced_catalog["skills"] if item["name"] != skill
        ]
        reduced_catalog_path.write_text(json.dumps(reduced_catalog), encoding="utf-8")

        self.env["JEO_SKILLS_CATALOG"] = str(reduced_catalog_path)
        self.successful(self.cli("usage", "scan", "--json"))
        self.assertNotIn(skill, self._rows(self._report()))
        reduced_usage = json.loads((self.state / "usage.json").read_text(encoding="utf-8"))
        self.assertNotIn(skill, reduced_usage["skills"])

        self.env["JEO_SKILLS_CATALOG"] = str(self.catalog_path)
        self.successful(self.cli("usage", "scan", "--json"))
        full_rows = self._rows(self._report())
        self.assertEqual(full_rows[skill]["count"], 1)
        self.assertEqual(full_rows[skill]["by_source"], {"claude_projects": 1})
        self.assertEqual(session.read_bytes(), session_bytes)

        self.env["JEO_SKILLS_CATALOG"] = str(reduced_catalog_path)
        self.successful(self.cli("usage", "scan", "--json"))
        self.assertNotIn(skill, self._rows(self._report()))
        carried_usage = json.loads((self.state / "usage.json").read_text(encoding="utf-8"))
        self.assertEqual(carried_usage["skills"][skill]["count"], 1)
        self.assertEqual(carried_usage["skills"][skill]["by_source"], {"claude_projects": 1})

        session.unlink()
        self.env["JEO_SKILLS_CATALOG"] = str(self.catalog_path)
        self.successful(self.cli("usage", "scan", "--json"))
        retained_rows = self._rows(self._report())
        self.assertEqual(retained_rows[skill]["count"], 1)
        self.assertEqual(retained_rows[skill]["by_source"], {"claude_projects": 1})


    def test_scan_lock_skips_if_idle_and_blocks_plain_scan(self):
        lock_path = self.state / "scan.lock"
        usage_path = self.state / "usage.json"
        cursor_path = self.state / "usage-cursor.json"
        with lock_path.open("a+b") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)

            idle = self.cli("usage", "scan", "--if-idle", "--json")
            self.successful(idle)
            self.assertIn("skipped", idle.stderr.lower())
            self.assertFalse(usage_path.exists())
            self.assertFalse(cursor_path.exists())

            process = subprocess.Popen(
                [sys.executable, str(ROUTER), "usage", "scan", "--json"],
                cwd=self.project,
                env={**self.env},
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            try:
                with self.assertRaises(subprocess.TimeoutExpired):
                    process.wait(timeout=0.5)
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

            try:
                stdout, stderr = process.communicate(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
                self.fail("plain usage scan did not complete after lock release")

        self.assertEqual(process.returncode, 0, stdout + stderr)
        self.assertTrue(usage_path.exists())
        self.assertTrue(lock_path.exists())

    def test_scan_is_idempotent_and_incremental_events_add_once(self):
        self.successful(self.cli("usage", "scan", "--json"))
        first = self._report()
        self.successful(self.cli("usage", "scan", "--json"))
        second = self._report()
        self.assertEqual(self._rows(first), self._rows(second))
        project_log = self.home / ".claude/projects/p/s.jsonl"
        with project_log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"role": "assistant", "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": "claude-project"}}]}) + "\n")
        self.successful(self.cli("usage", "scan", "--json"))
        changed = self._rows(self._report())
        self.assertEqual(changed["claude-project"]["count"], 2)
        self.assertEqual(changed["claude-project"]["by_source"], {"claude_projects": 2})

    def test_jev_delete_and_rotation_preserve_counts_without_double_counting(self):
        self.successful(self.cli("usage", "scan", "--json"))
        live = self.state / "jev-usage.jsonl"
        rotated = self.state / "jev-usage.20261001T000000000Z-1-x.jsonl"
        live.unlink()
        renamed = self.state / "jev-usage.20261002T000000000Z-2-y.jsonl"
        rotated.rename(renamed)
        self.successful(self.cli("usage", "scan", "--json"))
        self.assertEqual(self._rows(self._report())["jev-skill"]["count"], 2)
        with renamed.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"v": 1, "at": NOW_LATE, "agent": "fixture", "profile": "on", "routed": [], "injected": ["jev-skill"], "backend": {"kind": "local"}}) + "\n")
        self.successful(self.cli("usage", "scan", "--json", now=NOW_LATE))
        self.assertEqual(self._rows(self._report(now=NOW_LATE))["jev-skill"]["count"], 3)

    def test_report_statuses_grace_protection_and_late_install(self):
        self.successful(self.cli("usage", "scan", "--json"))
        self._install("late-skill")
        self.successful(self.cli("usage", "scan", "--json", now=NOW_LATE))
        relevance = {"version": 1, "generated_at": NOW_LATE, "backend": {"kind": "fixture"}, "repos": [], "protect": {"relevance-skill": {"score": 0.9, "repo": "/repo"}}}
        relevance_path = self.state / "relevance.json"
        relevance_path.write_text(json.dumps(relevance), encoding="utf-8")
        relevance_path.chmod(0o600)
        rows = self._rows(self._report(now=NOW_EXPIRED))
        self.assertEqual(rows["candidate-old"]["status"], "candidate")
        self.assertEqual(rows["late-skill"]["status"], "in-grace")
        self.assertEqual(rows["bundle-skill"]["status"], "protected")
        self.assertEqual(rows["bundle-skill"]["protected_reason"], "bundle:starter")
        self.assertEqual(rows["jeo-skill"]["status"], "protected")
        self.assertEqual(rows["relevance-skill"]["status"], "protected")
        self.assertTrue(rows["relevance-skill"]["protected_reason"].startswith("relevance:"))

    def test_report_before_scan_has_zero_candidates_and_list_shape(self):
        report = self._report()
        self.assertIsInstance(report["skills"], list)
        self.assertEqual(report["summary"]["candidate"], 0)
        self.assertEqual(report["tracking_started_at"], None)

    def test_keep_unkeep_and_unknown_name_rejection(self):
        before = self._snapshot()
        unknown = self.cli("usage", "keep", "does-not-exist")
        self.assertNotEqual(unknown.returncode, 0)
        self.assertIn("unknown catalog skills", unknown.stderr)
        self.assertEqual(self._snapshot(), before)
        self.successful(self.cli("usage", "keep", "kept-skill"))
        self.successful(self.cli("usage", "scan", "--json", now=NOW_OLD))
        self.assertEqual(self._rows(self._report(now=NOW_EXPIRED))["kept-skill"]["protected_reason"], "keep")
        self.successful(self.cli("usage", "unkeep", "kept-skill"))
        self.assertEqual(self._rows(self._report(now=NOW_EXPIRED))["kept-skill"]["status"], "candidate")

    def test_prune_without_apply_is_inert_and_requires_scan(self):
        before = self._snapshot()
        missing = self.cli("prune-unused", "--global", "--json")
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("no usage scan recorded", missing.stderr)
        self.assertEqual(self._snapshot(), before)
        self.successful(self.cli("usage", "scan", "--json", now=NOW_OLD))
        before = self._snapshot()
        preview = self.cli("prune-unused", "--global", "--json", now=NOW_EXPIRED)
        self.successful(preview)
        payload = json.loads(preview.stdout)
        self.assertIn("candidate-old", payload["candidates"])
        self.assertEqual(self._snapshot(), before)
        self.assertTrue((self.home / ".agents/skills/candidate-old/SKILL.md").is_file())


    def test_claude_config_profiles_merge_and_dedupe_project_store(self):
        profile = self.work / "claude-profile"
        profile.mkdir()
        (profile / ".claude.json").write_text(
            json.dumps({
                "skillUsage": {
                    "ns:bundle-skill": {"usageCount": 3, "lastUsedAt": 1767225600000},
                    "ns:claude-skill": {"usageCount": 5, "lastUsedAt": 1767225600000},
                }
            }),
            encoding="utf-8",
        )
        (profile / "projects").symlink_to(self.home / ".claude" / "projects", target_is_directory=True)

        self.env["CLAUDE_CONFIG_DIR"] = str(profile)
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["bundle-skill"]["count"], 3)
        self.assertEqual(rows["bundle-skill"]["by_source"], {"claude_skillusage": 3})
        self.assertEqual(rows["claude-skill"]["count"], 5)
        self.assertEqual(rows["claude-skill"]["by_source"], {"claude_skillusage": 5})
        self.assertEqual(rows["claude-project"]["count"], 1)
        self.assertEqual(rows["claude-project"]["by_source"], {"claude_projects": 1})

        profile_data = json.loads((profile / ".claude.json").read_text(encoding="utf-8"))
        profile_data["skillUsage"]["ns:late-skill"] = {"usageCount": 1, "lastUsedAt": 1767225600000}
        (profile / ".claude.json").write_text(json.dumps(profile_data), encoding="utf-8")
        self.env.pop("CLAUDE_CONFIG_DIR")
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["late-skill"]["count"], 1)
        self.assertEqual(rows["late-skill"]["by_source"], {"claude_skillusage": 1})

        second_profile = self.work / "claude-profile-two"
        second_profile.mkdir()
        (second_profile / ".claude.json").write_text(
            json.dumps({
                "skillUsage": {
                    "ns:kept-skill": {"usageCount": 4, "lastUsedAt": 1767225600000},
                }
            }),
            encoding="utf-8",
        )
        self.env["JEO_SKILL_CLAUDE_CONFIG_DIRS"] = str(second_profile)
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["kept-skill"]["count"], 4)
        self.assertEqual(rows["kept-skill"]["by_source"], {"claude_skillusage": 4})


    def test_claude_project_cursor_distinguishes_same_head_and_size(self):
        original = self.home / ".claude/projects/p/s.jsonl"
        original.unlink()
        header = b'{"header":"' + (b"H" * 5000) + b'"}\n'

        def transcript(skill):
            tail = json.dumps(
                {
                    "role": "assistant",
                    "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": skill}}],
                },
                separators=(",", ":"),
            ).encode("utf-8") + b"\n"
            return header + tail

        session_a = self.home / ".claude/projects/a/session.jsonl"
        session_b = self.home / ".claude/projects/b/session.jsonl"
        session_a.parent.mkdir(parents=True)
        session_b.parent.mkdir(parents=True)
        bytes_a = transcript("late-skill")
        bytes_b = transcript("kept-skill")
        self.assertGreater(len(header), 4096)
        self.assertEqual(len(bytes_a), len(bytes_b))
        self.assertNotEqual(bytes_a, bytes_b)
        session_a.write_bytes(bytes_a)
        mtime_ns = 1_700_000_000_123_456_789
        os.utime(session_a, ns=(mtime_ns, mtime_ns))
        self.successful(self.cli("usage", "scan", "--json"))

        session_b.write_bytes(bytes_b)
        os.utime(session_b, ns=(mtime_ns, mtime_ns))
        self.successful(self.cli("usage", "scan", "--json"))
        first = self._rows(self._report())
        for skill in ("late-skill", "kept-skill"):
            with self.subTest(skill=skill):
                self.assertEqual(first[skill]["count"], 1)
                self.assertEqual(first[skill]["by_source"], {"claude_projects": 1})

        self.successful(self.cli("usage", "scan", "--json"))
        second = self._rows(self._report())
        self.assertEqual(
            {skill: second[skill] for skill in ("late-skill", "kept-skill")},
            {skill: first[skill] for skill in ("late-skill", "kept-skill")},
        )

        session_b.unlink()
        self.successful(self.cli("usage", "scan", "--json"))
        retained = self._rows(self._report())
        self.assertEqual(retained["kept-skill"]["count"], 1)
        self.assertEqual(retained["kept-skill"]["by_source"], {"claude_projects": 1})

    def test_claude_project_byte_exact_copy_is_counted_once(self):
        (self.home / ".claude/projects/p/s.jsonl").unlink()
        source = self.home / ".claude/projects/source/session.jsonl"
        copy = self.home / ".claude/projects/copy/session.jsonl"
        source.parent.mkdir(parents=True)
        copy.parent.mkdir(parents=True)
        source.write_bytes(
            json.dumps(
                {
                    "role": "assistant",
                    "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": "late-skill"}}],
                },
                separators=(",", ":"),
            ).encode("utf-8") + b"\n"
        )
        shutil.copy2(source, copy)
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["late-skill"]["count"], 1)
        self.assertEqual(rows["late-skill"]["by_source"], {"claude_projects": 1})

    def test_jev_rotation_with_new_live_file_adds_one_event(self):
        self.successful(self.cli("usage", "scan", "--json"))
        before = self._rows(self._report())["jev-skill"]["count"]
        live = self.state / "jev-usage.jsonl"
        rotated = self.state / "jev-usage.20261003T000000000Z-1-x.jsonl"
        live.rename(rotated)
        self._jsonl(
            live,
            [
                {
                    "v": 1,
                    "at": NOW_LATE,
                    "agent": "fixture",
                    "profile": "new",
                    "routed": [],
                    "injected": ["jev-skill"],
                    "backend": {"kind": "local"},
                }
            ],
        )
        self.successful(self.cli("usage", "scan", "--json", now=NOW_LATE))
        after = self._rows(self._report(now=NOW_LATE))["jev-skill"]["count"]
        self.assertEqual(after, before + 1)

if __name__ == "__main__":
    unittest.main()
