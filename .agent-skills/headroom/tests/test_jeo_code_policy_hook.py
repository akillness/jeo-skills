#!/usr/bin/env python3
"""Executable contract tests for the Headroom Claude Code source-mutation hook.

Run from the repository root:
    python3 .agent-skills/headroom/tests/test_jeo_code_policy_hook.py

The test supplies fake ``graphify`` and ``headroom`` programs through ``PATH``.
Their call log is the observable proof that the hook performs one bounded,
read-only preflight per source-edit session rather than mutating the worktree.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
HOOK = HERE.parent / "scripts" / "jeo-code-policy-hook.py"
INSTALLER = HERE.parent / "scripts" / "setup-claude-code-policy-hook.sh"


class HookContractTests(unittest.TestCase):
    """Exercise the hook as Claude Code does: JSON in, JSON decision out."""

    def setUp(self) -> None:

        self.tempdir = tempfile.TemporaryDirectory(prefix="headroom-hook-test-")
        self.addCleanup(self.tempdir.cleanup)
        root = Path(self.tempdir.name)
        self.worktree = root / "worktree"
        self.worktree.mkdir()
        self.state_dir = root / "policy-state"
        self.state_dir.mkdir()
        self.bin_dir = root / "bin"
        self.bin_dir.mkdir()
        self.call_log = root / "tool-calls.jsonl"
        self._write_fake_executable("graphify")
        self._write_fake_executable("headroom")

        self.environment = os.environ.copy()
        self.environment.update(
            {
                "PATH": f"{self.bin_dir}{os.pathsep}{self.environment.get('PATH', '')}",
                "JEO_CODE_POLICY_STATE_DIR": str(self.state_dir),
                "JEO_HOOK_TEST_CALL_LOG": str(self.call_log),
            }
        )

    def _write_fake_executable(self, name: str) -> None:
        executable = self.bin_dir / name
        executable.write_text(
            "#!" + sys.executable + "\n"
            "import json\n"
            "import os\n"
            "import sys\n"
            "from pathlib import Path\n"
            "Path(os.environ['JEO_HOOK_TEST_CALL_LOG']).open('a', encoding='utf-8').write(\n"
            "    json.dumps({'program': Path(sys.argv[0]).name, 'args': sys.argv[1:], "
            "'cwd': os.getcwd()}) + '\\n'\n"
            ")\n",
            encoding="utf-8",
        )
        executable.chmod(0o755)

    def _invoke(
        self,
        *,
        session_id: str,
        tool_name: str,
        file_path: str,
        context_usage_percent: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "session_id": session_id,
            "cwd": str(self.worktree),
            "tool_name": tool_name,
            "tool_input": {"file_path": file_path},
        }
        if context_usage_percent is not None:
            payload["context_usage_percent"] = context_usage_percent

        completed = subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            cwd=self.worktree,
            env=self.environment,
            check=False,
        )
        self.assertEqual(
            completed.returncode,
            0,
            f"hook exited {completed.returncode}: {completed.stderr}",
        )
        try:
            decision = json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            self.fail(f"hook must emit one JSON decision, got {completed.stdout!r}: {error}")
        self.assertIsInstance(decision, dict, "hook decision must be a JSON object")
        return decision

    def _permission(self, decision: dict[str, Any]) -> str:
        output = decision.get("hookSpecificOutput")
        self.assertIsInstance(output, dict, "decision must contain hookSpecificOutput")
        self.assertEqual(output.get("hookEventName"), "PreToolUse")
        permission = output.get("permissionDecision")
        self.assertIn(permission, {"allow", "deny"})
        return permission

    def _reason(self, decision: dict[str, Any]) -> str:
        output = decision["hookSpecificOutput"]
        reason = output.get("permissionDecisionReason", "")
        self.assertIsInstance(reason, str)
        return reason

    def _calls(self) -> list[dict[str, Any]]:
        if not self.call_log.exists():
            return []
        return [json.loads(line) for line in self.call_log.read_text(encoding="utf-8").splitlines()]

    def _assert_preflight_calls(self, expected_total: int) -> None:
        calls = self._calls()
        self.assertEqual(len(calls), expected_total, calls)
        if not calls:
            return
        graphify_calls = [call for call in calls if call["program"] == "graphify"]
        headroom_calls = [call for call in calls if call["program"] == "headroom"]
        self.assertEqual(len(graphify_calls), expected_total // 2, calls)
        self.assertEqual(len(headroom_calls), expected_total // 2, calls)
        for call in graphify_calls:
            self.assertEqual(call["args"], ["scope", str(self.worktree)], call)
            self.assertEqual(Path(call["cwd"]).resolve(), self.worktree.resolve(), call)
        for call in headroom_calls:
            self.assertEqual(call["args"], ["doctor"], call)
            self.assertEqual(Path(call["cwd"]).resolve(), self.worktree.resolve(), call)

    def test_source_preflight_is_once_then_retry_proceeds(self) -> None:
        """A TypeScript Edit is denied once after bounded read-only preflights."""
        initial = self._invoke(
            session_id="ordinary-session",
            tool_name="Edit",
            file_path="src/policy.ts",
        )
        self.assertEqual(self._permission(initial), "deny")
        self._assert_preflight_calls(expected_total=2)
        self.assertFalse((self.worktree / ".graphify").exists())

        retry = self._invoke(
            session_id="ordinary-session",
            tool_name="Edit",
            file_path="src/policy.ts",
        )
        self.assertEqual(self._permission(retry), "allow")
        self._assert_preflight_calls(expected_total=2)
        self.assertFalse((self.worktree / ".graphify").exists())

    def test_high_context_requires_one_ponytail_retry_then_proceeds(self) -> None:
        """At 60%, the post-preflight retry is denied once with Ponytail guidance."""
        initial = self._invoke(
            session_id="high-context-session",
            tool_name="Edit",
            file_path="src/policy.ts",
            context_usage_percent=60,
        )
        self.assertEqual(self._permission(initial), "deny")
        self._assert_preflight_calls(expected_total=2)

        ponytail_retry = self._invoke(
            session_id="high-context-session",
            tool_name="Edit",
            file_path="src/policy.ts",
            context_usage_percent=60,
        )
        self.assertEqual(self._permission(ponytail_retry), "deny")
        self.assertIn("Ponytail", self._reason(ponytail_retry))
        self._assert_preflight_calls(expected_total=2)

        allowed = self._invoke(
            session_id="high-context-session",
            tool_name="Edit",
            file_path="src/policy.ts",
            context_usage_percent=60,
        )
        self.assertEqual(self._permission(allowed), "allow")
        self._assert_preflight_calls(expected_total=2)
        self.assertFalse((self.worktree / ".graphify").exists())

    def test_existing_graphify_directory_runs_check_update_once(self) -> None:
        """An existing graph tracks its update check without repeating it on retry."""
        (self.worktree / ".graphify").mkdir()

        initial = self._invoke(
            session_id="existing-graph-session",
            tool_name="Edit",
            file_path="src/policy.ts",
        )
        self.assertEqual(self._permission(initial), "deny")
        expected_calls = [
            ("graphify", ["scope", str(self.worktree)]),
            ("graphify", ["check-update", str(self.worktree)]),
            ("headroom", ["doctor"]),
        ]
        self.assertEqual(
            [(call["program"], call["args"]) for call in self._calls()],
            expected_calls,
        )
        self.assertTrue((self.worktree / ".graphify").is_dir())

        retry = self._invoke(
            session_id="existing-graph-session",
            tool_name="Edit",
            file_path="src/policy.ts",
        )
        self.assertEqual(self._permission(retry), "allow")
        self.assertEqual(
            [(call["program"], call["args"]) for call in self._calls()],
            expected_calls,
        )

    def test_markdown_write_bypasses_policy_and_preflights(self) -> None:
        """Non-source writes remain allowed and never invoke either preflight tool."""
        decision = self._invoke(
            session_id="documentation-session",
            tool_name="Write",
            file_path="notes/decision.md",
            context_usage_percent=60,
        )
        self.assertEqual(self._permission(decision), "allow")
        self.assertEqual(self._calls(), [])
        self.assertFalse((self.worktree / ".graphify").exists())



class InstallerContractTests(unittest.TestCase):
    """Exercise the real installer against isolated Claude configuration."""

    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(prefix="headroom-installer-test-")
        self.addCleanup(self.tempdir.cleanup)
        self.config_dir = Path(self.tempdir.name) / "claude-config"
        self.settings_file = self.config_dir / "settings.json"
        self.environment = os.environ.copy()
        self.environment["CLAUDE_CONFIG_DIR"] = str(self.config_dir)

    def _run_installer(self) -> None:
        completed = subprocess.run(
            ["bash", str(INSTALLER)],
            text=True,
            capture_output=True,
            env=self.environment,
            check=False,
        )
        self.assertEqual(
            completed.returncode,
            0,
            f"installer exited {completed.returncode}: {completed.stderr}",
        )

    def test_existing_private_settings_stay_private_after_hook_merge(self) -> None:
        """Merging the policy hook must not widen an existing private settings file."""
        self.config_dir.mkdir()
        self.settings_file.write_text("{}\n", encoding="utf-8")
        self.settings_file.chmod(0o600)

        self._run_installer()

        merged = json.loads(self.settings_file.read_text(encoding="utf-8"))
        self.assertIn(
            "Edit|Write",
            [
                entry.get("matcher")
                for entry in merged["hooks"]["PreToolUse"]
                if isinstance(entry, dict)
            ],
        )

        self.assertEqual(self.settings_file.stat().st_mode & 0o777, 0o600)

    def test_new_settings_file_is_private(self) -> None:
        """A first install creates Claude settings with private owner-only access."""
        self._run_installer()

        self.assertEqual(self.settings_file.stat().st_mode & 0o777, 0o600)

def main() -> int:
    if not HOOK.is_file():
        print(
            "Production hook is absent: expected "
            f"{HOOK}. Add the hook before running this contract test.",
            file=sys.stderr,
        )
        return 1
    return 0 if unittest.main(verbosity=2, exit=False).result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
