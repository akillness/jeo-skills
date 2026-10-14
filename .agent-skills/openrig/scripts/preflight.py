#!/usr/bin/env python3
"""Offline OpenRig host and source-checkout preflight."""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
TOOLS = ("node", "npm", "tmux", "git", "rig")
SOURCE_FILES = ("README.md", "LICENSE", "packages/cli/package.json", "scripts/install.sh", "docs/reference/rig-spec.md")
HOST_ENV_KEYS = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")

def add_check(checks: list[dict[str, str]], name: str, state: str, detail: str) -> None:
    checks.append({"name": name, "status": state, "detail": detail})


def result(checks: list[dict[str, str]], status: str = "") -> dict[str, object]:
    if not status:
        statuses = {item["status"] for item in checks}
        status = "error" if "error" in statuses else "blocked" if "blocked" in statuses else "ok"
    return {
        "skill": "openrig",
        "scope": "offline-preflight",
        "status": status,
        "checks": checks,
        "runtime_verified": False,
    }

def invalid(message: str) -> dict[str, object]:
    return result([{"name": "input", "status": "error", "detail": message}], "error")


def git_output(git: str, repo: Path, *args: str) -> tuple[str, str]:
    env = {key: os.environ[key] for key in HOST_ENV_KEYS if key in os.environ}
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    try:
        completed = subprocess.run(
            [git, *args], cwd=str(repo), capture_output=True, text=True,
            timeout=2, check=False, env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return "", type(exc).__name__
    if completed.returncode != 0:
        return "", f"exit {completed.returncode}"
    return completed.stdout.strip(), ""
def build(args: argparse.Namespace) -> dict[str, object]:
    checks: list[dict[str, str]] = []
    system = platform.system()
    machine = platform.machine() or "unknown"
    if system == "Darwin" and machine.lower() in {"arm64", "aarch64"}:
        detail = f"{system}/{machine} supported; Apple Silicon should use Node.js 22 (version unverified)"
        add_check(checks, "platform", "ok", detail)
    elif system in {"Darwin", "Linux"}:
        add_check(checks, "platform", "ok", f"{system}/{machine} supported; Node.js version unverified")
    elif system == "Windows":
        add_check(checks, "platform", "blocked", "native Windows is unsupported; use the documented WSL2 route")
    else:
        add_check(checks, "platform", "blocked", f"{system}/{machine} is outside the audited macOS/Linux support")

    py = sys.version_info
    py_state = "ok" if py >= (3, 10) else "blocked"
    add_check(checks, "python", py_state, f"Python {py.major}.{py.minor}.{py.micro}; helper readiness only")

    paths: dict[str, str] = {}
    for tool in TOOLS:
        found = shutil.which(tool)
        if found:
            paths[tool] = found
            add_check(checks, f"tool:{tool}", "ok", f"found at {found}; version unverified")
        else:
            add_check(checks, f"tool:{tool}", "blocked", f"{tool} is not on PATH")

    if args.repo:
        repo = Path(args.repo)
        if not repo.exists():
            add_check(checks, "repo.path", "blocked", "checkout path does not exist")
            return result(checks)
        if not repo.is_dir():
            add_check(checks, "repo.path", "blocked", "checkout path is not a directory")
            return result(checks)

        root = repo.resolve()
        git = paths.get("git")
        if not git:
            add_check(checks, "repo.git", "blocked", "git is required to inspect checkout identity")
        else:
            discovered, error = git_output(git, repo, "rev-parse", "--show-toplevel")
            if discovered:
                discovered_root = Path(discovered).resolve()
                if discovered_root != root:
                    add_check(checks, "repo.git", "blocked", "Git root differs from --repo; checkout identity withheld")
                    add_check(checks, "repo.commit", "blocked", "HEAD withheld because Git root mismatch")
                else:
                    add_check(checks, "repo.git", "ok", "bounded local Git root matches --repo")
                    commit, error = git_output(git, repo, "rev-parse", "HEAD")
                    if commit:
                        if args.expect_commit and commit.lower() != args.expect_commit.lower():
                            add_check(checks, "repo.commit", "blocked", "HEAD does not match --expect-commit")
                        else:
                            suffix = " and matches --expect-commit" if args.expect_commit else ""
                            add_check(checks, "repo.commit", "ok", f"HEAD {commit}{suffix}")
                    else:
                        add_check(checks, "repo.commit", "blocked", f"cannot resolve HEAD ({error})")
            else:
                add_check(checks, "repo.git", "blocked", f"cannot resolve checkout root ({error})")

        missing = [name for name in SOURCE_FILES if not (root / name).is_file()]
        if missing:
            add_check(checks, "repo.shape", "blocked", "missing public source files: " + ", ".join(missing))
        else:
            add_check(checks, "repo.shape", "ok", "audited public checkout shape is present")

    return result(checks)


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    json_mode = "--json" in argv
    parser = argparse.ArgumentParser(description="Offline OpenRig host and checkout preflight")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", help="local OpenRig checkout to inspect")
    parser.add_argument("--expect-commit", help="compare checkout HEAD to this full SHA (requires --repo)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        if exc.code == 0:
            return 0
        data = invalid("invalid command-line arguments")
        print(json.dumps(data, sort_keys=True) if json_mode else "openrig offline-preflight: invalid input")
        return 2

    if args.expect_commit is not None and not args.repo:
        data = invalid("--expect-commit requires --repo")
        print(json.dumps(data, sort_keys=True) if args.json else "openrig offline-preflight: invalid input")
        return 2
    if args.expect_commit is not None and not COMMIT_RE.fullmatch(args.expect_commit):
        data = invalid("--expect-commit must be a full 40-character hexadecimal SHA")
        print(json.dumps(data, sort_keys=True) if args.json else "openrig offline-preflight: invalid input")
        return 2

    data = build(args)
    if args.json:
        print(json.dumps(data, sort_keys=True))
    else:
        print(f"openrig offline-preflight: {data['status']}")
        for check in data["checks"]:
            print(f"- {check['name']}: {check['status']} - {check['detail']}")
    return 0 if data["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
