#!/usr/bin/env python3
"""Unit and CLI tests for unified global/per-project workflow logging."""
from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
JEO_SKILL_SCRIPTS = ROOT / ".agent-skills" / "jeo-skill" / "scripts"
if str(JEO_SKILL_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(JEO_SKILL_SCRIPTS))

import workflow_log_cli  # type: ignore  # noqa: E402

STANDALONE = ROOT / "scripts" / "workflow-log.py"
JEO_SKILL_CLI = JEO_SKILL_SCRIPTS / "jeo-skill.py"


class WorkflowLogTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name).resolve()
        self.home = self.base / "home"
        self.home.mkdir()
        self.state_dir = self.home / ".local" / "state" / "jeo-skill"
        self._prev_env = os.environ.get("JEO_SKILL_STATE_DIR")
        os.environ["JEO_SKILL_STATE_DIR"] = str(self.state_dir)

    def tearDown(self) -> None:
        if self._prev_env is None:
            os.environ.pop("JEO_SKILL_STATE_DIR", None)
        else:
            os.environ["JEO_SKILL_STATE_DIR"] = self._prev_env
        self._tmp.cleanup()

    def _make_project(self, name: str, *, custom: bool, order: list[str] | None = None, jev_profile: str | None = None) -> Path:
        proj = self.home / name
        h2 = proj / ".harness2"
        h2.mkdir(parents=True)
        wf: dict[str, object] = {"custom": custom}
        if order is not None:
            wf["order"] = order
        if jev_profile is not None:
            wf["jev_profile"] = jev_profile
        (h2 / "workspace.json").write_text(json.dumps({"workflow": wf}), encoding="utf-8")
        return proj

    def test_detect_project_flow_global_vs_custom_and_stop_at_home(self) -> None:
        global_proj = self.home / "plain-proj"
        nested_global = global_proj / "sub" / "pkg"
        nested_global.mkdir(parents=True)
        # Put a decoy .harness2 inside $HOME root — must be ignored when walking up
        (self.home / ".harness2").mkdir(exist_ok=True)
        (self.home / ".harness2" / "workspace.json").write_text(
            json.dumps({"workflow": {"custom": True, "order": ["wrong"]}}),
            encoding="utf-8",
        )
        g_info = workflow_log_cli.detect_project_flow(nested_global, home=self.home)
        self.assertEqual(g_info["flow_mode"], "global")
        self.assertEqual(g_info["workflow_order"], list(workflow_log_cli.DEFAULT_ORDER))

        custom_proj = self._make_project("custom-proj", custom=True, order=["rtk", "semble", "mex"], jev_profile="off")
        nested_custom = custom_proj / "src" / "app"
        nested_custom.mkdir(parents=True)
        c_info = workflow_log_cli.detect_project_flow(nested_custom, home=self.home)
        self.assertEqual(c_info["flow_mode"], "project-custom")
        self.assertEqual(c_info["project"], str(custom_proj))
        self.assertEqual(c_info["workflow_order"], ["rtk", "semble", "mex"])
        self.assertEqual(c_info["jev_profile"], "off")

    def test_record_scrubs_secrets_and_permissions(self) -> None:
        proj = self._make_project("sec-proj", custom=True, order=["rtk", "semble", "jev"], jev_profile="agy")
        ev = workflow_log_cli.record_event(
            "jev-route",
            outcome="ok",
            project=proj,
            host="claude",
            duration_ms=12.345,
            details={
                "api_key": "super-secret-value",
                "custom_token": "tok-value",
                "note": "Authorization: Bearer abcdef12345678 ctx7sk-deadbeef0123 sk-proj1234567890ab AIzaSyA123456789012345678901 ghp_123456789012345678901234",
            },
            home=self.home,
        )
        self.assertEqual(ev["flow_mode"], "project-custom")
        self.assertEqual(ev["duration_ms"], 12.35)
        self.assertEqual(ev["api_key"], "[REDACTED]")
        self.assertEqual(ev["custom_token"], "[REDACTED]")
        self.assertNotIn("ctx7sk-deadbeef", ev["note"])
        self.assertNotIn("sk-proj", ev["note"])
        self.assertNotIn("AIzaSyA", ev["note"])
        self.assertNotIn("ghp_1234", ev["note"])
        self.assertNotIn("abcdef12345678", ev["note"])

        ledger = workflow_log_cli.ledger_path(home=self.home)
        self.assertEqual(stat.S_IMODE(self.state_dir.lstat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(ledger.lstat().st_mode), 0o600)

    def test_legacy_normalization_and_summary(self) -> None:
        self.state_dir.mkdir(parents=True)
        os.chmod(self.state_dir, 0o700)
        ledger = workflow_log_cli.ledger_path(home=self.home)
        custom_proj = self._make_project("p1", custom=True, order=["rtk", "mex"], jev_profile="off")
        legacy = {
            "ts": "2026-11-18T00:00:00Z",
            "stage": "openspace-skip",
            "customProject": True,
            "order": ["rtk", "mex"],
            "agent": "codex",
            "skipped": "project-workflow-disabled",
            "project": str(custom_proj),
        }
        ledger.write_text(json.dumps(legacy) + "\n", encoding="utf-8")
        os.chmod(ledger, 0o600)

        workflow_log_cli.record_event("jev-route", outcome="ok", project=self.home / "global-p", host="agy", home=self.home)
        events, errors = workflow_log_cli.iter_all_events(home=self.home)
        self.assertEqual(errors, 0)
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["flow_mode"], "project-custom")
        self.assertEqual(events[0]["outcome"], "skipped")
        self.assertEqual(events[0]["host"], "codex")
        summ = workflow_log_cli.build_summary(events)
        self.assertEqual(summ["total"], 2)
        self.assertEqual(summ["by_flow_mode"], {"global": 1, "project-custom": 1})
        self.assertIn(str(custom_proj), summ["custom_projects"])

    def test_symlink_guards_and_doctor_checks(self) -> None:
        self.state_dir.mkdir(parents=True)
        os.chmod(self.state_dir, 0o700)
        target = self.base / "decoy.jsonl"
        target.write_text("", encoding="utf-8")
        ledger = self.state_dir / workflow_log_cli.LEDGER_NAME
        ledger.symlink_to(target)

        with self.assertRaises(OSError):
            workflow_log_cli.record_event("test", home=self.home)

        rc_bad = workflow_log_cli._cmd_doctor(as_json=True)
        self.assertEqual(rc_bad, 1)

        ledger.unlink()
        workflow_log_cli.record_event("test", home=self.home)
        rc_ok = workflow_log_cli._cmd_doctor(as_json=True)
        self.assertEqual(rc_ok, 0)

        # Malformed JSONL triggers parse_errors -> doctor returns 1
        with ledger.open("a", encoding="utf-8") as fh:
            fh.write("{bad-json\n")
        rc_err = workflow_log_cli._cmd_doctor(as_json=True)
        self.assertEqual(rc_err, 1)

    def test_rotation_and_retention(self) -> None:
        orig_rot = workflow_log_cli.ROTATE_BYTES
        orig_ret = workflow_log_cli.RETENTION_BYTES
        try:
            workflow_log_cli.ROTATE_BYTES = 180
            workflow_log_cli.RETENTION_BYTES = 450
            for i in range(6):
                workflow_log_cli.record_event(f"stage-{i}", details={"payload": "x" * 120}, home=self.home)
            segs = workflow_log_cli._rotated_segments(self.state_dir)
            self.assertGreaterEqual(len(segs), 1)
            total_seg_bytes = sum(p.stat().st_size for p in segs)
            self.assertLessEqual(total_seg_bytes, 700)
            events, errors = workflow_log_cli.iter_all_events(home=self.home)
            self.assertEqual(errors, 0)
            self.assertGreaterEqual(len(events), 2)
        finally:
            workflow_log_cli.ROTATE_BYTES = orig_rot
            workflow_log_cli.RETENTION_BYTES = orig_ret

    def test_cli_standalone_and_jeo_skill_flow_log(self) -> None:
        env = dict(os.environ)
        env["HOME"] = str(self.home)
        env["JEO_SKILL_STATE_DIR"] = str(self.state_dir)
        custom_proj = self._make_project("cli-custom", custom=True, order=["rtk", "semble", "jev"], jev_profile="agy")
        global_proj = self.home / "cli-global"
        global_proj.mkdir()

        def run_cli(cmd: list[str]) -> dict[str, object] | list[object] | str:
            proc = subprocess.run(cmd, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
            self.assertEqual(proc.returncode, 0, msg=f"cmd={cmd}\nstdout={proc.stdout}\nstderr={proc.stderr}")
            out = proc.stdout.strip()
            return json.loads(out) if out.startswith("{") else out

        run_cli([sys.executable, "-B", str(STANDALONE), "record", "--stage", "jeo-step", "--project", str(global_proj), "--host", "codex", "--json"])
        run_cli([sys.executable, "-B", str(JEO_SKILL_CLI), "flow-log", "record", "--stage", "jev-route", "--project", str(custom_proj), "--host", "claude", "--duration-ms", "5.5", "--detail", '{"routed":["rtk","semble"]}', "--json"])

        tail_custom = run_cli([sys.executable, "-B", str(STANDALONE), "tail", "--custom-only", "--json"])
        assert isinstance(tail_custom, dict)
        self.assertEqual(tail_custom["count"], 1)
        self.assertEqual(tail_custom["events"][0]["flow_mode"], "project-custom")

        tail_global = run_cli([sys.executable, "-B", str(JEO_SKILL_CLI), "flow-log", "tail", "--global-only", "--json"])
        assert isinstance(tail_global, dict)
        self.assertEqual(tail_global["count"], 1)
        self.assertEqual(tail_global["events"][0]["flow_mode"], "global")

        summ = run_cli([sys.executable, "-B", str(JEO_SKILL_CLI), "flow-log", "summary", "--json"])
        assert isinstance(summ, dict)
        self.assertEqual(summ["total"], 2)
        self.assertEqual(summ["by_flow_mode"], {"global": 1, "project-custom": 1})

        doc = run_cli([sys.executable, "-B", str(STANDALONE), "doctor", "--json"])
        assert isinstance(doc, dict)
        self.assertTrue(doc["ok"])
        self.assertEqual(doc["events"], 2)

        clr_dry = run_cli([sys.executable, "-B", str(STANDALONE), "clear", "--older-than", "0", "--json"])
        assert isinstance(clr_dry, dict)
        self.assertFalse(clr_dry["apply"])
        self.assertEqual(clr_dry["removed"], [])

        clr_apply = run_cli([sys.executable, "-B", str(STANDALONE), "clear", "--older-than", "0", "--apply", "--json"])
        assert isinstance(clr_apply, dict)
        self.assertTrue(clr_apply["apply"])
        self.assertEqual(len(clr_apply["removed"]), 1)
        events_after, _ = workflow_log_cli.iter_all_events(home=self.home)
        self.assertEqual(events_after, [])


if __name__ == "__main__":
    unittest.main()
