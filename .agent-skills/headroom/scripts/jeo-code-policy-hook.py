#!/usr/bin/env python3
"""Claude Code source-mutation policy for Headroom, Graphify, and Ponytail.

Reads one Claude Code hook JSON object from stdin and emits a JSON PreToolUse
decision. The only worktree-facing commands are Graphify's documented read-only
``scope`` and ``check-update`` preflights; per-session state lives in a cache
outside the worktree.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

SOURCE_EXTENSIONS = frozenset(
    {
        ".c",
        ".cc",
        ".cpp",
        ".cs",
        ".dart",
        ".ex",
        ".exs",
        ".fs",
        ".fsx",
        ".go",
        ".h",
        ".hpp",
        ".java",
        ".js",
        ".jsx",
        ".kt",
        ".kts",
        ".lua",
        ".m",
        ".mm",
        ".php",
        ".pl",
        ".pm",
        ".py",
        ".r",
        ".rb",
        ".rs",
        ".scala",
        ".sh",
        ".sql",
        ".swift",
        ".svelte",
        ".ts",
        ".tsx",
        ".vue",
        ".zig",
    }
)
PREFLIGHT_STALE_SECONDS = 30
COMMAND_TIMEOUT_SECONDS = 8
OUTPUT_LIMIT = 500


def is_source_path(value: object) -> bool:
    """Return true only for the documented source-file extension allowlist."""
    return isinstance(value, str) and Path(value).suffix.lower() in SOURCE_EXTENSIONS


def source_path(payload: dict[str, Any]) -> object:
    """Read only the standard file-path fields used by Edit and Write tools."""
    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return None
    return tool_input.get("file_path", tool_input.get("path"))


def context_usage_percent(payload: dict[str, Any]) -> float | None:
    """Accept an explicit host percentage; never derive one from other telemetry."""
    value = payload.get("context_usage_percent")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    percentage = float(value)
    return percentage if 0 <= percentage <= 100 else None


def policy_cwd(payload: dict[str, Any]) -> Path:
    """Use an absolute hook cwd when present, otherwise use the current directory."""
    value = payload.get("cwd")
    if isinstance(value, str):
        candidate = Path(value)
        if candidate.is_absolute() and candidate.is_dir():
            return candidate
    return Path.cwd()


def state_root() -> Path:
    """Return an external, overrideable cache location for session markers."""
    configured = os.environ.get("JEO_CODE_POLICY_STATE_DIR")
    if configured:
        return Path(configured)
    cache_home = os.environ.get("XDG_CACHE_HOME")
    if cache_home:
        return Path(cache_home) / "jeo-skills" / "headroom-code-policy"
    return Path(tempfile.gettempdir()) / "jeo-skills" / "headroom-code-policy"


def session_state_dir(payload: dict[str, Any], cwd: Path) -> Path:
    """Derive an opaque path so session IDs never become filenames."""
    session_id = payload.get("session_id")
    value = session_id if isinstance(session_id, str) else "no-session-id"
    digest = hashlib.sha256(f"{value}\0{cwd}".encode("utf-8")).hexdigest()
    directory = state_root() / digest
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def claim_marker(directory: Path, marker: str) -> bool:
    """Atomically claim a one-time policy action across parallel tool calls."""
    target = directory / marker
    try:
        descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(f"{time.time():.6f}\n")
    return True


def stale_marker(path: Path) -> bool:
    """Remove only a clearly abandoned in-progress preflight marker."""
    try:
        age_seconds = time.time() - path.stat().st_mtime
    except FileNotFoundError:
        return False
    if age_seconds <= PREFLIGHT_STALE_SECONDS:
        return False
    try:
        path.unlink()
    except FileNotFoundError:
        return False
    return True


def run_read_only(command: list[str], cwd: Path) -> str:
    """Run a bounded argv command and return a compact diagnostic, never raising."""
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError:
        return f"{command[0]} unavailable"
    except subprocess.TimeoutExpired:
        return f"{' '.join(command[:2])} timed out"
    output = " ".join(result.stdout.split())[:OUTPUT_LIMIT]
    if not output:
        output = f"exit {result.returncode}"
    return f"exit {result.returncode}: {output}"


def preflight(cwd: Path) -> str:
    """Run Graphify and Headroom checks without creating graph artifacts."""
    summaries = [f"graphify scope: {run_read_only(['graphify', 'scope', str(cwd)], cwd)}"]
    if (cwd / ".graphify").is_dir():
        summaries.append(
            f"graphify check-update: {run_read_only(['graphify', 'check-update', str(cwd)], cwd)}"
        )
    summaries.append(f"headroom doctor: {run_read_only(['headroom', 'doctor'], cwd)}")
    return "; ".join(summaries)


def decision(permission: str, reason: str) -> dict[str, object]:
    """Build Claude Code's explicit PreToolUse hook decision payload."""
    return {
        "continue": True,
        "suppressOutput": False,
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": permission,
            "permissionDecisionReason": reason,
        },
    }


def handle(payload: dict[str, Any]) -> dict[str, object]:
    """Apply at most one preflight and one 60%-context Ponytail retry per session."""
    if payload.get("tool_name") not in {"Edit", "Write"} or not is_source_path(source_path(payload)):
        return decision("allow", "JEO code policy: non-source mutation allowed.")

    cwd = policy_cwd(payload)
    directory = session_state_dir(payload, cwd)
    preflight_pending = directory / "preflight-in-progress"
    preflight_complete = directory / "preflight-complete"
    if not preflight_complete.exists():
        stale_marker(preflight_pending)
        if claim_marker(directory, "preflight-in-progress"):
            evidence = preflight(cwd)
            claim_marker(directory, "preflight-complete")
            try:
                preflight_pending.unlink()
            except FileNotFoundError:
                pass
            return decision(
                "deny",
                "JEO code policy preflight complete. Use the Graphify and Headroom evidence before "
                f"retrying this source mutation. {evidence}",
            )
        return decision(
            "deny",
            "JEO code policy preflight is in progress for a concurrent source mutation. Retry this "
            "source mutation after the Graphify and Headroom evidence is available.",
        )

    percentage = context_usage_percent(payload)
    if percentage is not None and percentage >= 60 and claim_marker(directory, "ponytail-at-60-percent"):
        return decision(
            "deny",
            "JEO code policy: host context usage is at least 60%. Activate Ponytail full, walk the "
            "minimal-code ladder, and retain validation, data-loss safety, security, and accessibility "
            "before retrying this source mutation.",
        )

    return decision("allow", "JEO code policy: source mutation allowed.")


def self_test() -> int:
    """Exercise pure helpers without invoking external commands or touching a worktree."""
    assert is_source_path("src/service.py")
    assert is_source_path("web/view.tsx")
    assert not is_source_path("README.md")
    assert context_usage_percent({"context_usage_percent": 60}) == 60.0
    assert context_usage_percent({"context_usage_percent": "60"}) is None
    assert context_usage_percent({"context_usage_percent": 101}) is None
    print("self-test=PASS")
    return 0


def main() -> int:
    if sys.argv[1:] == ["--self-test"]:
        return self_test()
    try:
        incoming = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        incoming = {}
    payload = incoming if isinstance(incoming, dict) else {}
    print(json.dumps(handle(payload), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
