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

    def test_incremental_growth_counts_load_and_ignores_non_load_tail(self):
        session = self.home / ".claude/projects/p/s.jsonl"
        self.successful(self.cli("usage", "scan", "--json"))
        before = self._rows(self._report())["claude-project"]
        load = json.dumps(
            {"role": "assistant", "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": "claude-project"}}]},
            separators=(",", ":"),
        )
        with session.open("a", encoding="utf-8") as handle:
            handle.write(load + "\n")
        self.successful(self.cli("usage", "scan", "--json"))
        after_load = self._rows(self._report())["claude-project"]
        self.assertEqual(after_load["count"], before["count"] + 1)
        self.assertEqual(after_load["by_source"], {"claude_projects": before["count"] + 1})
        with session.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"role": "user", "content": "not a skill load"}) + "\n")
        self.successful(self.cli("usage", "scan", "--json"))
        after_non_load = self._rows(self._report())["claude-project"]
        self.assertEqual(after_non_load, after_load)

    def test_rewrite_before_cursor_forces_full_reparse_and_keeps_highwater(self):
        session = self.home / ".claude/projects/p/rewrite.jsonl"

        def load(skill):
            return json.dumps(
                {"role": "assistant", "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": skill}}]},
                separators=(",", ":"),
            ).encode("utf-8") + b"\n"

        event_a = load("late-skill")
        event_b = load("kept-skill")
        self.assertEqual(len(event_a), len(event_b))
        filler = b'{"filler":"' + (b"x" * 6000) + b'"}\n'
        original = event_a + filler
        session.write_bytes(original)
        self.successful(self.cli("usage", "scan", "--json"))
        first = self._rows(self._report())
        self.assertEqual(first["late-skill"]["by_source"], {"claude_projects": 1})
        self.assertEqual(first["kept-skill"]["count"], 0)

        rewritten = event_b + original[len(event_a):] + b'{"role":"user","content":"tail"}\n'
        self.assertEqual(rewritten[len(event_b):len(event_b) + len(filler)], filler)
        session.write_bytes(rewritten)
        self.successful(self.cli("usage", "scan", "--json"))
        second = self._rows(self._report())
        self.assertEqual(second["kept-skill"]["count"], 1)
        self.assertEqual(second["kept-skill"]["by_source"], {"claude_projects": 1})
        self.assertEqual(second["late-skill"]["count"], 1)
        self.assertEqual(second["late-skill"]["by_source"], {"claude_projects": 1})

    def test_partial_and_complete_final_lines_are_consumed_once(self):
        original = self.home / ".claude/projects/p/s.jsonl"
        original.unlink()

        def load(skill):
            return json.dumps(
                {"role": "assistant", "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": skill}}]},
                separators=(",", ":"),
            ).encode("utf-8")

        partial_path = self.home / ".claude/projects/p/partial.jsonl"
        complete_a = load("late-skill") + b"\n"
        cut = len(complete_a) - 8
        partial_path.write_bytes(complete_a[:cut])
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["late-skill"]["count"], 0)

        with partial_path.open("ab") as handle:
            handle.write(complete_a[cut:])
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["late-skill"]["count"], 1)
        self.successful(self.cli("usage", "scan", "--json"))
        self.assertEqual(self._rows(self._report())["late-skill"]["count"], 1)

        complete_path = self.home / ".claude/projects/p/complete.jsonl"
        complete_path.write_bytes(load("kept-skill"))
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["kept-skill"]["count"], 1)
        with complete_path.open("ab") as handle:
            handle.write(b"\n" + load("kept-skill") + b"\n")
        self.successful(self.cli("usage", "scan", "--json"))
        self.assertEqual(self._rows(self._report())["kept-skill"]["count"], 2)

    def test_oversized_line_is_skipped_without_losing_following_loads(self):
        session = self.home / ".claude/projects/p/s.jsonl"
        session.unlink()

        def load(skill):
            return json.dumps(
                {"role": "assistant", "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": skill}}]},
                separators=(",", ":"),
            ).encode("utf-8") + b"\n"

        oversized = b'{"padding":"' + (b"x" * (8 * 1024 * 1024 + 128)) + b'"}\n'
        session.write_bytes(load("late-skill") + oversized + load("kept-skill"))
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["late-skill"]["count"], 1)
        self.assertEqual(rows["kept-skill"]["count"], 1)
        self.assertEqual(rows["late-skill"]["by_source"], {"claude_projects": 1})
        self.assertEqual(rows["kept-skill"]["by_source"], {"claude_projects": 1})

    def test_invalid_utf8_in_unrelated_field_does_not_drop_load(self):
        session = self.home / ".claude/projects/p/s.jsonl"
        session.unlink()
        session.write_bytes(
            b'{"role":"assistant","unrelated":"bad \xff byte","content":'
            b'[{"type":"tool_use","name":"Skill","input":{"skill":"late-skill"}}]}\n'
        )
        self.successful(self.cli("usage", "scan", "--json"))
        row = self._rows(self._report())["late-skill"]
        self.assertEqual(row["count"], 1)
        self.assertEqual(row["by_source"], {"claude_projects": 1})

    def test_touch_only_change_does_not_recount(self):
        session = self.home / ".claude/projects/p/s.jsonl"
        self.successful(self.cli("usage", "scan", "--json"))
        before = self._rows(self._report())["claude-project"]
        before_bytes = session.read_bytes()
        stat = session.stat()
        os.utime(session, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
        self.assertEqual(session.read_bytes(), before_bytes)
        self.successful(self.cli("usage", "scan", "--json"))
        self.assertEqual(self._rows(self._report())["claude-project"], before)

    def test_atomic_replacement_new_inode_same_length_and_mtime_is_parsed(self):
        session = self.home / ".claude/projects/p/s.jsonl"
        session.unlink()

        def load(skill):
            return json.dumps(
                {"role": "assistant", "content": [{"type": "tool_use", "name": "Skill", "input": {"skill": skill}}]},
                separators=(",", ":"),
            ).encode("utf-8") + b"\n"

        old_bytes = load("late-skill")
        new_bytes = load("kept-skill")
        self.assertEqual(len(old_bytes), len(new_bytes))
        session.write_bytes(old_bytes)
        self.successful(self.cli("usage", "scan", "--json"))
        old_stat = session.stat()
        replacement = session.with_name("replacement.jsonl")
        replacement.write_bytes(new_bytes)
        os.utime(replacement, ns=(old_stat.st_atime_ns, old_stat.st_mtime_ns))
        os.replace(replacement, session)
        new_stat = session.stat()
        self.assertNotEqual(new_stat.st_ino, old_stat.st_ino)
        self.assertEqual(new_stat.st_size, old_stat.st_size)
        self.assertEqual(new_stat.st_mtime_ns, old_stat.st_mtime_ns)
        self.successful(self.cli("usage", "scan", "--json"))
        rows = self._rows(self._report())
        self.assertEqual(rows["kept-skill"]["count"], 1)
        self.assertEqual(rows["kept-skill"]["by_source"], {"claude_projects": 1})
        self.assertEqual(rows["late-skill"]["count"], 1)
        self.assertEqual(rows["late-skill"]["by_source"], {"claude_projects": 1})

    def test_pi_block_scan_refinds_prefilter_tokens_after_repeated_line_hits(self):
        names = {
            "a": "candidate-old",
            "b": "late-skill",
            "c": "kept-skill",
            "d": "codex-skill",
            "e": "bundle-skill",
        }
        jeopi = self.home / ".jeopi/agent/sessions/x/s.jsonl"
        self._jsonl(
            jeopi,
            [
                {
                    "type": "message",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "toolCall",
                                "name": "read",
                                "arguments": {"path": f"/h/.agents/skills/{names['a']}/SKILL.md"},
                            },
                            {"type": "text", "text": "SKILL.md skill://candidate-old"},
                        ],
                    },
                },
                {"type": "message", "message": {"role": "assistant", "content": [{"type": "text", "text": "ordinary response"}]}},
                {
                    "type": "message",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "toolCall",
                                "name": "read",
                                "arguments": {"path": f"/h/.agents/skills/{names['b']}/SKILL.md"},
                            }
                        ],
                    },
                },
                {"type": "custom_message", "customType": "skill-prompt", "details": {"name": names["c"]}},
                {
                    "type": "message",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "toolCall",
                                "name": "read",
                                "arguments": {"path": f"/h/.agents/skills/{names['a']}/SKILL.md"},
                            }
                        ],
                    },
                },
            ],
        )
        codex = self.home / ".codex/sessions/2026/10/01/rollout-x.jsonl"
        self._jsonl(
            codex,
            [
                {
                    "type": "event_msg",
                    "payload": {
                        "type": "item_completed",
                        "item": {
                            "type": "CommandExecution",
                            "status": "completed",
                            "exit_code": 0,
                            "parsed_cmd": [{"type": "read", "path": f"/h/.agents/skills/{names['d']}/SKILL.md"}],
                        },
                    },
                },
                {
                    "type": "event_msg",
                    "payload": {
                        "type": "item_completed",
                        "item": {
                            "type": "CommandExecution",
                            "status": "completed",
                            "exit_code": 0,
                            "parsed_cmd": [{"type": "read", "path": f"/h/.agents/skills/{names['e']}/SKILL.md"}],
                        },
                    },
                },
            ],
        )

        result = self.cli("usage", "scan", "--json")
        self.successful(result)
        rows = self._rows(self._report())
        for key, expected in (("a", 2), ("b", 1), ("c", 1), ("d", 1), ("e", 1)):
            with self.subTest(skill=names[key]):
                self.assertEqual(rows[names[key]]["count"], expected)

    def test_claude_project_partial_unconsumed_tails_are_counted_per_file(self):
        (self.home / ".claude/projects/p/s.jsonl").unlink()
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

        prefix = transcript("late-skill")
        session_a = self.home / ".claude/projects/a/session.jsonl"
        session_b = self.home / ".claude/projects/b/session.jsonl"
        session_a.parent.mkdir(parents=True)
        session_b.parent.mkdir(parents=True)
        bytes_a = prefix + b'{"tail":"A"}'
        bytes_b = prefix + b'{"tail":"B"}'
        self.assertNotEqual(bytes_a, bytes_b)
        self.assertEqual(len(bytes_a), len(bytes_b))
        session_a.write_bytes(bytes_a)
        session_b.write_bytes(bytes_b)

        self.successful(self.cli("usage", "scan", "--json"))
        row = self._rows(self._report())["late-skill"]
        self.assertEqual(row["count"], 2)
        self.assertEqual(row["by_source"], {"claude_projects": 2})

    # ---- jeo: project-local session stores and the assistant tool-use parser ----

    def _jeo_catalog(self, *names):
        catalog = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        known = {item["name"] for item in catalog["skills"]}
        for name in names:
            if name in known:
                continue
            catalog["categories"]["engineering"].append(name)
            catalog["skills"].append(
                {"name": name, "category": "engineering", "subcategory": "testing", "description": "usage fixture"}
            )
        self.catalog_path.write_text(json.dumps(catalog), encoding="utf-8")

    @staticmethod
    def _jeo_uri(name):
        return "skill" + "://" + name

    @staticmethod
    def _jeo_path(name, base="/h/.agents/skills"):
        return f"{base}/{name}/SKILL.md"

    @staticmethod
    def _jeo_call(tool, arguments):
        return {"id": f"call-{tool}", "tool": tool, "arguments": arguments}

    @staticmethod
    def _jeo_message(calls=None, *, role="assistant", stamp=NOW_OLD, text=None):
        message = {"role": role}
        if text is not None:
            message["content"] = [{"type": "text", "text": text}]
        if calls is not None:
            message["toolUse"] = calls
        return {"type": "message", "timestamp": stamp, "message": message}

    def _jeo_read(self, name, *, key="filePath", target=None, stamp=NOW_OLD):
        call = self._jeo_call("read", {key: target or self._jeo_path(name)})
        return self._jeo_message([call], stamp=stamp)

    def _jeo_scan(self, *args, now=NOW_OLD):
        result = self.cli("usage", "scan", "--json", *args, now=now)
        self.successful(result)
        return json.loads(result.stdout)

    def _jeo_cursor(self):
        return json.loads((self.state / "usage-cursor.json").read_text(encoding="utf-8"))

    def _jeo_count(self, name):
        row = self._rows(self._report())[name]
        return row["count"], row["by_source"]

    @staticmethod
    def _jeo_lines(stdout):
        return [line for line in stdout.splitlines() if line.split()[:1] == ["jeo"]]

    def test_jeo_parser_counts_only_assistant_read_calls_naming_catalog_skills(self):
        positives = {
            "jx-key-filepath": self._jeo_read("jx-key-filepath", key="filePath"),
            "jx-key-path": self._jeo_read("jx-key-path", key="path"),
            "jx-key-file": self._jeo_read("jx-key-file", key="file"),
            "jx-key-file-path": self._jeo_read("jx-key-file-path", key="file_path"),
            "jx-key-uri": self._jeo_read(
                "jx-key-uri", key="path", target=self._jeo_uri("jx-key-uri"), stamp=NOW_LATE
            ),
            # a write and a read in one assistant record: only the read is a load
            "jx-key-mixed": self._jeo_message([
                self._jeo_call("write", {"filePath": self._jeo_path("jx-neg-mixed-write")}),
                self._jeo_call("read", {"filePath": self._jeo_path("jx-key-mixed")}),
            ]),
        }

        def argument_soup(name):
            # every path-ish key a read would use, so only the tool name can exclude the call
            target = self._jeo_path(name)
            return {"filePath": target, "path": target, "command": "cat " + target}

        negatives = {
            # path-only lines in a find/bash result are what the pre-tool-use parser mistook for loads
            "jx-neg-find-result": {
                "type": "message", "timestamp": NOW_EXPIRED,
                "toolResults": [{"id": "r1", "tool": "find", "output": self._jeo_path("jx-neg-find-result") + "\n"}],
            },
            "jx-neg-bash-result": {
                "type": "message", "timestamp": NOW_EXPIRED,
                "message": {"role": "toolResult", "toolResults": [
                    {"id": "r2", "tool": "bash", "output": self._jeo_path("jx-neg-bash-result")}
                ]},
            },
            "jx-neg-user-text": self._jeo_message(
                role="user", stamp=NOW_EXPIRED,
                text="open " + self._jeo_path("jx-neg-user-text") + " via " + self._jeo_uri("jx-neg-user-text"),
            ),
            "jx-neg-user-call": self._jeo_message(
                [self._jeo_call("read", {"filePath": self._jeo_path("jx-neg-user-call")})],
                role="user", stamp=NOW_EXPIRED,
            ),
            "jx-neg-assistant-text": self._jeo_message(
                stamp=NOW_EXPIRED, text="next I will read " + self._jeo_path("jx-neg-assistant-text")
            ),
            "jx-neg-checkout": self._jeo_read(
                "jx-neg-checkout", target="/work/repo/.agent-skills/jx-neg-checkout/SKILL.md", stamp=NOW_EXPIRED
            ),
        }
        for tool in ("write", "edit", "bash", "find", "ls", "grep"):
            name = f"jx-neg-{tool}"
            negatives[name] = self._jeo_message([self._jeo_call(tool, argument_soup(name))], stamp=NOW_EXPIRED)
        unknown = [
            self._jeo_read("jx-not-in-catalog", stamp=NOW_EXPIRED),
            self._jeo_read("jx-not-in-catalog", key="path", target=self._jeo_uri("jx-not-in-catalog"), stamp=NOW_EXPIRED),
        ]
        negative_names = [*negatives, "jx-neg-mixed-write"]
        self._jeo_catalog(*positives, *negative_names)
        self._jsonl(
            self.home / ".jeo/sessions/parser.jsonl",
            [*negatives.values(), *positives.values(), *unknown],
        )

        scan = self._jeo_scan()
        rows = self._rows(self._report())
        for name in positives:
            with self.subTest(positive=name):
                self.assertEqual((rows[name]["count"], rows[name]["by_source"]), (1, {"jeo": 1}))
        for name in negative_names:
            with self.subTest(negative=name):
                self.assertEqual((rows[name]["count"], rows[name]["by_source"]), (0, {}))
        jeo = scan["sources"]["jeo"]
        self.assertEqual(jeo["records"], len(positives))
        # negatives carry the latest timestamp and must not widen the window
        self.assertEqual(jeo["window"], [NOW_OLD, NOW_LATE])
        self.assertNotIn("jx-not-in-catalog", (self.state / "usage.json").read_text(encoding="utf-8"))

    def test_jeo_project_root_option_reads_project_store_and_is_remembered(self):
        other = self.work / "other-project"
        self.assertNotEqual(other, self.project)  # the CLI's cwd is self.project
        self._jeo_catalog("jx-proj")
        self._jsonl(other / ".jeo/sessions/u1.jsonl", [self._jeo_read("jx-proj")])

        text = self.cli("usage", "scan", "--project-root", str(other))
        self.successful(text)
        lines = self._jeo_lines(text.stdout)
        self.assertEqual(len(lines), 1, text.stdout)
        self.assertRegex(lines[0], r"\bok\b.*records=1\s")
        self.assertEqual(self._jeo_count("jx-proj"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_cursor()["jeo_project_roots"], [os.path.realpath(other)])

        # a later scan, run without the option, still reads the remembered project store
        self._jsonl(other / ".jeo/sessions/u2.jsonl", [self._jeo_read("jx-proj", stamp=NOW_LATE)])
        later = self._jeo_scan(now=NOW_LATE)
        self.assertEqual(later["sources"]["jeo"]["records"], 2)
        self.assertEqual(self._jeo_count("jx-proj"), (2, {"jeo": 2}))

    def test_jeo_home_and_project_stores_sum_into_one_source_with_merged_window(self):
        first, second = self.work / "sum-one", self.work / "sum-two"
        self._jeo_catalog("jx-sum-home", "jx-sum-one", "jx-sum-two")
        self._jsonl(self.home / ".jeo/sessions/h.jsonl", [self._jeo_read("jx-sum-home", stamp=NOW_LATE)])
        self._jsonl(first / ".jeo/sessions/a.jsonl", [self._jeo_read("jx-sum-one", stamp=NOW_OLD)])
        self._jsonl(second / ".jeo/sessions/b.jsonl", [self._jeo_read("jx-sum-two", stamp=NOW_EXPIRED)])

        text = self.cli("usage", "scan", "--project-root", str(first), "--project-root", str(second))
        self.successful(text)
        lines = self._jeo_lines(text.stdout)
        self.assertEqual(len(lines), 1, text.stdout)
        self.assertRegex(lines[0], r"records=3\s")
        self.assertIn(f"window={NOW_OLD}..{NOW_EXPIRED}", lines[0])
        rows = self._rows(self._report())
        for name in ("jx-sum-home", "jx-sum-one", "jx-sum-two"):
            with self.subTest(skill=name):
                self.assertEqual((rows[name]["count"], rows[name]["by_source"]), (1, {"jeo": 1}))
        self.assertEqual(
            self._jeo_cursor()["jeo_project_roots"], [os.path.realpath(first), os.path.realpath(second)]
        )

    def test_jeo_session_dirs_env_adds_absolute_existing_dirs_and_ignores_the_rest(self):
        one, two = self.work / "env-one", self.work / "env-two"
        missing = self.work / "env-missing"
        relative_store = self.project / "rel-store"  # "rel-store" resolves against the CLI's cwd
        self._jeo_catalog("jx-env-one", "jx-env-two", "jx-env-rel")
        self._jsonl(one / "a.jsonl", [self._jeo_read("jx-env-one")])
        self._jsonl(two / "b.jsonl", [self._jeo_read("jx-env-two")])
        self._jsonl(relative_store / "c.jsonl", [self._jeo_read("jx-env-rel")])
        self.env["JEO_SKILL_JEO_SESSION_DIRS"] = os.pathsep.join(
            [str(one), "rel-store", str(missing), "", str(two)]
        )

        scan = self._jeo_scan()
        self.assertEqual(scan["sources"]["jeo"]["records"], 2)
        self.assertEqual(self._jeo_count("jx-env-one"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_count("jx-env-two"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_count("jx-env-rel"), (0, {}))

    def test_jeo_relevance_repos_and_cwd_stores_are_read(self):
        repo = self.work / "relevant-repo"
        self._jeo_catalog("jx-rel-repo", "jx-rel-relative", "jx-cwd")
        self._jsonl(repo / ".jeo/sessions/r.jsonl", [self._jeo_read("jx-rel-repo")])
        # a relative repo entry must not be resolved against the cwd
        self._jsonl(self.project / "relative/repo/.jeo/sessions/x.jsonl", [self._jeo_read("jx-rel-relative")])
        self._jsonl(self.project / ".jeo/sessions/c.jsonl", [self._jeo_read("jx-cwd")])
        relevance = self.state / "relevance.json"
        relevance.write_text(
            json.dumps({"version": 1, "repos": [str(repo), "relative/repo", 7, ""], "protect": {}}),
            encoding="utf-8",
        )
        relevance.chmod(0o600)

        scan = self._jeo_scan()
        self.assertEqual(scan["sources"]["jeo"]["records"], 2)
        self.assertEqual(self._jeo_count("jx-rel-repo"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_count("jx-cwd"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_count("jx-rel-relative"), (0, {}))

    def test_jeo_same_physical_dir_reached_twice_is_counted_once(self):
        real, alias = self.work / "real-project", self.work / "alias-project"
        real.mkdir()
        alias.symlink_to(real, target_is_directory=True)
        self._jeo_catalog("jx-alias")
        self._jsonl(real / ".jeo/sessions/u.jsonl", [self._jeo_read("jx-alias")])
        self.env["JEO_SKILL_JEO_SESSION_DIRS"] = os.pathsep.join(
            [str(alias / ".jeo/sessions"), str(real / ".jeo/sessions")]
        )

        scan = self._jeo_scan("--project-root", str(alias), "--project-root", str(real))
        self.assertEqual(scan["sources"]["jeo"]["records"], 1)
        self.assertEqual(self._jeo_count("jx-alias"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_cursor()["jeo_project_roots"], [os.path.realpath(real)])
        # remembered root plus env dir still resolve to one store on the next scan
        self.assertEqual(self._jeo_scan()["sources"]["jeo"]["records"], 1)
        self.assertEqual(self._jeo_count("jx-alias"), (1, {"jeo": 1}))

    def test_jeo_symlinked_store_dir_is_skipped(self):
        target = self.work / "elsewhere/sessions"
        project = self.work / "symlink-project"
        self._jeo_catalog("jx-symlinked")
        self._jsonl(target / "u.jsonl", [self._jeo_read("jx-symlinked")])
        (project / ".jeo").mkdir(parents=True)
        (project / ".jeo/sessions").symlink_to(target, target_is_directory=True)

        scan = self._jeo_scan("--project-root", str(project))
        self.assertEqual(scan["sources"]["jeo"]["records"], 0)
        self.assertFalse(scan["sources"]["jeo"]["available"])
        self.assertEqual(self._jeo_count("jx-symlinked"), (0, {}))

        # the env route applies the same rule: the symlink is skipped, its real target is not
        self.env["JEO_SKILL_JEO_SESSION_DIRS"] = str(project / ".jeo/sessions")
        self.assertEqual(self._jeo_scan()["sources"]["jeo"]["records"], 0)
        self.env["JEO_SKILL_JEO_SESSION_DIRS"] = str(target)
        self.assertEqual(self._jeo_scan()["sources"]["jeo"]["records"], 1)
        self.assertEqual(self._jeo_count("jx-symlinked"), (1, {"jeo": 1}))

    def test_jeo_non_directory_project_root_warns_exits_zero_and_is_not_remembered(self):
        self._jeo_catalog("jx-bad-root")
        target = self.work / "was-a-file"
        target.write_text("not a directory", encoding="utf-8")
        missing = self.work / "no-such-project"

        result = self.cli(
            "usage", "scan", "--json", "--project-root", str(target), "--project-root", str(missing)
        )
        self.successful(result)
        for bad in (target, missing):
            self.assertIn(f"--project-root {bad} is not an existing directory", result.stderr)
        self.assertIn("summary", json.loads(result.stdout))
        self.assertEqual(self._jeo_cursor().get("jeo_project_roots"), [])

        # once the path becomes a real project it is read only if passed again: nothing was remembered
        target.unlink()
        self._jsonl(target / ".jeo/sessions/u.jsonl", [self._jeo_read("jx-bad-root")])
        self.assertEqual(self._jeo_scan()["sources"]["jeo"]["records"], 0)
        self.assertEqual(self._jeo_count("jx-bad-root"), (0, {}))
        self._jeo_scan("--project-root", str(target))
        self.assertEqual(self._jeo_count("jx-bad-root"), (1, {"jeo": 1}))

    def test_jeo_remembered_root_that_vanishes_is_pruned_and_keeps_its_contribution(self):
        project = self.work / "vanishing-project"
        self._jeo_catalog("jx-vanish")
        self._jsonl(project / ".jeo/sessions/u1.jsonl", [self._jeo_read("jx-vanish")])
        self._jeo_scan("--project-root", str(project))
        self.assertEqual(self._jeo_count("jx-vanish"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_cursor()["jeo_project_roots"], [os.path.realpath(project)])

        shutil.rmtree(project)
        self._jeo_scan()
        self.assertEqual(self._jeo_cursor()["jeo_project_roots"], [])
        self.assertEqual(self._jeo_count("jx-vanish"), (1, {"jeo": 1}))

        # recreating the directory does not resurrect the pruned root...
        self._jsonl(project / ".jeo/sessions/u2.jsonl", [self._jeo_read("jx-vanish", stamp=NOW_LATE)])
        self._jeo_scan()
        self.assertEqual(self._jeo_count("jx-vanish"), (1, {"jeo": 1}))
        # ...but passing it again reads the new session on top of the retained one
        self._jeo_scan("--project-root", str(project))
        self.assertEqual(self._jeo_count("jx-vanish"), (2, {"jeo": 2}))

    def test_jeo_cursor_from_old_parser_is_reread_once_without_double_counting(self):
        self._jeo_catalog("jx-mig-lost", "jx-mig-kept")
        store = self.home / ".jeo/sessions"
        self._jsonl(store / "lost.jsonl", [self._jeo_read("jx-mig-lost")])
        self._jsonl(store / "kept.jsonl", [self._jeo_read("jx-mig-kept", stamp=NOW_LATE)])
        clean = self._jeo_scan()
        clean_jeo = clean["sources"]["jeo"]
        self.assertEqual(clean_jeo["records"], 2)
        self.assertEqual(self._jeo_count("jx-mig-lost"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_count("jx-mig-kept"), (1, {"jeo": 1}))
        self.assertIsInstance(self._jeo_cursor()["jeo_parser_version"], int)

        # rewind to what the old parser left behind: no version, and lost.jsonl recorded nothing
        cursor = self._jeo_cursor()
        del cursor["jeo_parser_version"]
        entries = {Path(e["path"]).name: e for e in cursor["files"].values() if e["source"] == "jeo"}
        entries["lost.jsonl"]["contribution"] = {}
        entries["lost.jsonl"]["records"] = 0
        (self.state / "usage-cursor.json").write_text(json.dumps(cursor), encoding="utf-8")
        (self.state / "usage.json").unlink()  # the cursor must be the only memory of old counts

        migrated = self._jeo_scan()
        self.assertEqual(migrated["sources"]["jeo"]["records"], clean_jeo["records"])
        self.assertEqual(migrated["sources"]["jeo"]["window"], clean_jeo["window"])
        self.assertEqual(self._jeo_count("jx-mig-lost"), (1, {"jeo": 1}))  # recovered by the forced re-read
        self.assertEqual(self._jeo_count("jx-mig-kept"), (1, {"jeo": 1}))  # not inflated by it
        self.assertGreaterEqual(self._jeo_cursor()["jeo_parser_version"], 2)

        again = self._jeo_scan()
        self.assertEqual(again["sources"]["jeo"]["records"], clean_jeo["records"])
        self.assertEqual(self._jeo_count("jx-mig-lost"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_count("jx-mig-kept"), (1, {"jeo": 1}))

    def test_jeo_scan_never_persists_transcript_text(self):
        sentinel = "JEO_TRANSCRIPT_SENTINEL_7c41d9"
        project = self.work / "leak-project"
        env_store = self.work / "leak-env-store"
        stores = [self.home / ".jeo/sessions", project / ".jeo/sessions", env_store]
        self.env["JEO_SKILL_JEO_SESSION_DIRS"] = str(env_store)
        names = [f"jx-leak-{index}" for index in range(len(stores))]
        self._jeo_catalog(*names)
        for store, name in zip(stores, names):
            path = self._jeo_path(name)
            self._jsonl(store / "s.jsonl", [
                self._jeo_message(role="user", text=f"{sentinel} {path}"),
                # a counted load whose record also carries transcript text
                self._jeo_message([self._jeo_call("read", {"filePath": path})], text=f"{sentinel} reading"),
                self._jeo_message([self._jeo_call("write", {"filePath": path, "content": sentinel})]),
                {"type": "message", "timestamp": NOW_OLD,
                 "toolResults": [{"id": "r", "tool": "find", "output": f"{sentinel}\n{path}\n"}]},
            ])

        self._jeo_scan("--project-root", str(project))
        for name in names:
            self.assertEqual(self._jeo_count(name), (1, {"jeo": 1}))  # the files really were parsed
        persisted = b"".join(path.read_bytes() for path in self.state.rglob("*") if path.is_file())
        names_on_disk = "\n".join(str(path.relative_to(self.state)) for path in self.state.rglob("*"))
        self.assertNotIn(sentinel.encode(), persisted)
        self.assertNotIn(sentinel, names_on_disk)

    def test_jeo_default_home_store_is_still_read_without_roots_or_env(self):
        self.assertNotIn("JEO_SKILL_JEO_SESSION_DIRS", self.env)
        self._jeo_catalog("jx-default")
        self._jsonl(self.home / ".jeo/sessions/d.jsonl", [self._jeo_read("jx-default")])

        scan = self._jeo_scan()
        jeo = scan["sources"]["jeo"]
        self.assertTrue(jeo["available"])
        self.assertEqual(jeo["records"], 1)
        self.assertIsNone(jeo["error"])
        self.assertEqual(self._jeo_count("jx-default"), (1, {"jeo": 1}))
        self.assertEqual(self._jeo_cursor().get("jeo_project_roots"), [])

    def test_jeo_remembered_project_roots_are_capped_to_the_newest_512(self):
        roots = []
        for index in range(513):
            root = self.work / "cap" / f"p{index:03d}"
            root.mkdir(parents=True)
            roots.append(root)
        self._jeo_catalog("jx-cap-dropped", "jx-cap-kept")
        self._jsonl(roots[0] / ".jeo/sessions/u.jsonl", [self._jeo_read("jx-cap-dropped")])
        self._jsonl(roots[-1] / ".jeo/sessions/u.jsonl", [self._jeo_read("jx-cap-kept")])

        self._jeo_scan(*[arg for root in roots for arg in ("--project-root", str(root))])
        self.assertEqual(self._jeo_cursor()["jeo_project_roots"], [os.path.realpath(r) for r in roots[1:]])
        self.assertEqual(self._jeo_count("jx-cap-dropped"), (0, {}))
        self.assertEqual(self._jeo_count("jx-cap-kept"), (1, {"jeo": 1}))

if __name__ == "__main__":
    unittest.main()
