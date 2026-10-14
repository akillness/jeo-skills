#!/usr/bin/env python3
"""Offline, side-effect-free preflight for the Uzu operator skill."""
from __future__ import annotations

import argparse
import os
import json
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

SKILL = "uzu"
SCOPE = "offline-preflight"
PIN_PATTERN = r"^[0-9a-f]{40}$"
PUBLIC_FILES = ("Cargo.toml", "README.md", "LICENSE", ".config/platforms.toml")


class InputError(ValueError):
    """Malformed CLI input, distinct from an unavailable prerequisite."""


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)


def build_parser() -> Parser:
    result = Parser(description="Check Uzu host and local checkout prerequisites without running Uzu.")
    result.add_argument("--json", action="store_true", help="emit one JSON object")
    result.add_argument("--repo", type=Path, help="local Uzu checkout to inspect")
    result.add_argument("--expect-commit", help="full 40-character commit; requires --repo")
    return result


def check(name: str, status: str, detail: str) -> dict[str, str]:
    return {"name": name, "status": status, "detail": detail}


def git_output(repo: Path, *args: str) -> tuple[bool, str]:
    """Run bounded, read-only git queries without inherited repository-selection env."""
    git_path = shutil.which("git")
    if git_path is None:
        return False, ""
    host_keys = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
    safe_env = {key: os.environ[key] for key in host_keys if key in os.environ}
    safe_env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    try:
        completed = subprocess.run([git_path, "-C", str(repo), *args], capture_output=True, text=True, timeout=5, check=False, env=safe_env)
    except (OSError, subprocess.TimeoutExpired):
        return False, ""
    value = completed.stdout.strip()
    return completed.returncode == 0 and bool(value), value


def inspect_repo(repo: Path, expected: str | None, checks: list[dict[str, str]]) -> bool:
    if not repo.exists() or not repo.is_dir():
        raise InputError(f"--repo is not a directory: {repo}")
    if shutil.which("git") is None:
        checks.append(check("git", "blocked", "git is not discoverable; local checkout cannot be inspected"))
        return False
    requested = repo.resolve()
    ok, root_text = git_output(requested, "rev-parse", "--show-toplevel")
    if not ok:
        checks.append(check("repo.git", "blocked", "path is not a readable Git worktree"))
        return False
    root = Path(root_text).resolve()
    if root != requested:
        checks.append(check("repo.git", "blocked", f"Git resolved {root} instead of requested checkout {requested}"))
        return False
    checks.append(check("repo.git", "ok", f"Git worktree resolved to {root}"))
    ok, head = git_output(requested, "rev-parse", "--verify", "HEAD")
    if not ok:
        checks.append(check("repo.commit", "blocked", "HEAD could not be resolved"))
        return False
    if expected is not None and head != expected:
        checks.append(check("repo.commit", "blocked", f"HEAD {head} does not match --expect-commit {expected}"))
        return False
    checks.append(check("repo.commit", "ok" if expected else "unknown", f"HEAD {head}" if expected is None else f"HEAD matches caller-supplied {expected}"))
    shape_ok = True
    for relative in PUBLIC_FILES:
        present = (root / relative).is_file()
        shape_ok = shape_ok and present
        checks.append(check(f"repo.file:{relative}", "ok" if present else "blocked", "public source file present" if present else "required public source file is missing"))
    return shape_ok


def run(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    if args.expect_commit is not None and re.fullmatch(PIN_PATTERN, args.expect_commit) is None:
        raise InputError("--expect-commit must be a full 40-character lowercase hexadecimal SHA")
    if args.repo is None and args.expect_commit is not None:
        raise InputError("--expect-commit requires --repo")
    checks: list[dict[str, str]] = []
    blockers = False
    machine = platform.machine().lower()
    machine = {"aarch64": "arm64", "arm64": "arm64", "x86_64": "x86_64", "amd64": "x86_64"}.get(machine, machine)
    system = platform.system().lower()
    primary = system == "darwin" and machine == "arm64"
    if primary:
        checks.append(check("host", "ok", "Darwin arm64: primary Apple Silicon Metal path; activation is unverified"))
    else:
        blockers = True
        checks.append(check("host", "blocked", f"{system or 'unknown'} {machine or 'unknown'} is not the primary Apple Silicon macOS path; source targets are CPU-oriented/in progress"))
    version = sys.version_info
    python_ok = version >= (3, 10)
    blockers = blockers or not python_ok
    checks.append(check("python", "ok" if python_ok else "blocked", f"Python {version.major}.{version.minor}.{version.micro} (requires >=3.10)" if python_ok else f"Python {version.major}.{version.minor}.{version.micro} is below the >=3.10 helper requirement"))
    mirai, cargo, rustc = shutil.which("mirai"), shutil.which("cargo"), shutil.which("rustc")
    source_ok = cargo is not None and rustc is not None
    checks.append(check("mirai", "ok" if mirai else "unknown", f"discoverable at {mirai}" if mirai else "not discoverable; published CLI path unavailable"))
    checks.append(check("source-toolchain", "ok" if source_ok else "blocked", f"cargo={cargo}, rustc={rustc}" if source_ok else f"requires cargo and rustc (cargo={cargo}, rustc={rustc})"))
    if not mirai and not source_ok:
        blockers = True
        checks.append(check("execution-path", "blocked", "neither mirai nor a complete cargo/rustc path is available"))
    else:
        checks.append(check("execution-path", "ok", "at least one operator path is discoverable; no runtime command was executed"))
    if args.repo is not None:
        blockers = not inspect_repo(args.repo, args.expect_commit, checks) or blockers
    checks.append(check("runtime", "unknown", "runtime activation, model availability, Metal/CPU acceleration, and service health were not tested"))
    result = {"skill": SKILL, "scope": SCOPE, "status": "blocked" if blockers else "ok", "checks": checks, "runtime_verified": False}
    return result, 1 if blockers else 0


def emit(result: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"{result['skill']} {result['scope']}: {result['status']}")
        for item in result["checks"]:
            print(f"- {item['name']}: {item['status']} — {item['detail']}")


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    try:
        args = build_parser().parse_args(raw)
        result, code = run(args)
    except InputError as exc:
        result = {"skill": SKILL, "scope": SCOPE, "status": "error", "checks": [{"name": "input", "status": "error", "detail": str(exc)}], "runtime_verified": False}
        code = 2
    emit(result, "--json" in raw)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
