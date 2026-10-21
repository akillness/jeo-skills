#!/usr/bin/env python3
"""Offline, read-only Ruflo host and checkout preflight."""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any

SKILL = "ruflo"
EXPECTED_SHA = re.compile(r"[0-9a-fA-F]{40}\Z")
MAX_MARKER_BYTES = 1024 * 1024
REQUIRED_TOOLS = ("node", "npm", "npx", "git", "claude")
STRUCTURE = (
    ("README.md", "file"),
    ("LICENSE", "file"),
    ("package.json", "file"),
    ("v3/@claude-flow/cli/package.json", "file"),
    ("v3/@claude-flow/cli/src/commands/init.ts", "file"),
    ("v3/@claude-flow/cli/src/commands/swarm.ts", "file"),
    ("v3/@claude-flow/cli/src/commands/memory.ts", "file"),
)


def parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="preflight.py",
        description="Inspect safe host facts and an optional local Ruflo checkout; never run Ruflo.",
        add_help=False,
        exit_on_error=False,
    )
    parser.add_argument("-h", "--help", action="store_true", help="show this help and exit")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", metavar="PATH", help="optional local Ruflo checkout")
    parser.add_argument("--expect-commit", metavar="FULL_SHA", help="expected 40-hex checkout commit (requires --repo)")
    return parser


def check(name: str, status: str, detail: str, **extra: Any) -> dict[str, Any]:
    item: dict[str, Any] = {"name": name, "status": status, "detail": detail}
    item.update(extra)
    return item


def result(status: str, checks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "skill": SKILL,
        "scope": "offline-preflight",
        "status": status,
        "checks": checks,
        "runtime_verified": False,
    }


def parse(argv: list[str]) -> tuple[argparse.Namespace | None, str | None]:
    args_parser = parser()
    if "--help" in argv or "-h" in argv:
        args_parser.print_help()
        return None, None
    try:
        return args_parser.parse_args(argv), None
    except (argparse.ArgumentError, SystemExit) as exc:
        return None, str(exc) or "invalid arguments"


def inspect_repo(repo_arg: str, expected: str | None, checks: list[dict[str, Any]]) -> None:
    supplied = Path(repo_arg)
    try:
        absolute = Path(os.path.abspath(os.fspath(supplied)))
        supplied_stat = os.lstat(absolute)
    except (OSError, ValueError) as exc:
        checks.append(check("repo", "blocked", f"supplied checkout cannot be inspected: {exc}", path=str(supplied)))
        return
    if os.path.islink(absolute) or stat.S_ISLNK(supplied_stat.st_mode):
        checks.append(check("repo", "unsafe-symlink", "supplied --repo path is a symlink; refusing symlink traversal", path=str(supplied)))
        return
    if not absolute.is_dir():
        checks.append(check("repo", "blocked", "supplied --repo is not a directory", path=str(supplied)))
        return
    checks.append(check("repo", "ok", "supplied checkout directory exists", path=str(supplied)))

    git_marker = absolute / ".git"
    try:
        git_stat = os.lstat(git_marker)
    except OSError:
        git_stat = None
    if git_stat is None:
        checks.append(check("repo_git", "blocked", "checkout has no .git marker", path=str(git_marker)))
    elif stat.S_ISLNK(git_stat.st_mode):
        checks.append(check("repo_git", "unsafe-symlink", ".git marker is a symlink; refusing traversal", path=str(git_marker)))
        return
    else:
        checks.append(check("repo_git", "ok", "checkout has a .git marker", path=str(git_marker)))

    for relative, kind in STRUCTURE:
        path = absolute / relative
        try:
            marker_stat = os.lstat(path)
        except OSError:
            marker_stat = None
        if marker_stat is None:
            checks.append(check(f"repo.structure:{relative}", "blocked", f"{kind} missing", path=str(path)))
            continue
        if stat.S_ISLNK(marker_stat.st_mode):
            checks.append(check(f"repo.structure:{relative}", "unsafe-symlink", f"{kind} marker is a symlink; refusing traversal", path=str(path)))
            continue
        valid = path.is_file() if kind == "file" else path.is_dir()
        if not valid:
            checks.append(check(f"repo.structure:{relative}", "blocked", f"{kind} has wrong type", path=str(path)))
            continue
        if kind == "file" and marker_stat.st_size > MAX_MARKER_BYTES:
            checks.append(check(f"repo.structure:{relative}", "oversized", f"marker exceeds {MAX_MARKER_BYTES} byte bound", path=str(path), bytes=marker_stat.st_size))
            continue
        checks.append(check(f"repo.structure:{relative}", "ok", f"{kind} present", path=str(path), bytes=marker_stat.st_size))

    vcs = shutil.which("git")
    if vcs is None:
        checks.append(check("repo_commit", "blocked", "git is unavailable; checkout commit cannot be inspected"))
        return
    git_env = {
        key: os.environ[key]
        for key in ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
        if key in os.environ
    }
    git_env.update({
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_ALLOW_PROTOCOL": "",
    })
    try:
        proc = subprocess.run(
            [vcs, "-C", str(absolute), "rev-parse", "--show-toplevel", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
            env=git_env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        checks.append(check("repo_commit", "blocked", f"bounded git rev-parse failed: {exc}"))
        return
    lines = proc.stdout.splitlines()
    if proc.returncode != 0 or len(lines) != 2:
        checks.append(check("repo_commit", "blocked", "bounded git rev-parse did not return root and full commit", observed=proc.stdout.strip()))
        return
    observed_root, observed = lines
    try:
        root_matches = Path(observed_root).resolve() == absolute.resolve()
    except OSError:
        root_matches = False
    if not root_matches:
        checks.append(check("repo_root", "blocked", "git show-toplevel does not match supplied checkout", observed=observed_root, expected=str(absolute.resolve())))
        return
    if not EXPECTED_SHA.fullmatch(observed):
        checks.append(check("repo_commit", "blocked", "bounded git rev-parse did not return a full commit", observed=observed))
        return
    if expected is None:
        checks.append(check("repo_commit", "ok", "observed checkout commit; no comparison requested", observed=observed))
    else:
        matches = observed.lower() == expected.lower()
        checks.append(check("repo_commit", "ok" if matches else "blocked", "checkout commit matches --expect-commit" if matches else "checkout commit mismatches --expect-commit", observed=observed, expected=expected))


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    wants_json = "--json" in raw
    args, error = parse(raw)
    if args is None and error is None:
        return 0
    if error is not None:
        payload = result("error", [check("input", "blocked", error)])
        if wants_json:
            print(json.dumps(payload, sort_keys=True))
        else:
            print(f"Ruflo offline preflight: error\n- input: {error}")
        return 2
    assert args is not None
    if args.expect_commit is not None and args.repo is None:
        payload = result("error", [check("input", "blocked", "--expect-commit requires --repo")])
        if args.json:
            print(json.dumps(payload, sort_keys=True))
        else:
            print("Ruflo offline preflight: error\n- input: --expect-commit requires --repo")
        return 2
    if args.expect_commit is not None and not EXPECTED_SHA.fullmatch(args.expect_commit):
        payload = result("error", [check("input", "blocked", "--expect-commit must be exactly 40 hexadecimal characters")])
        if args.json:
            print(json.dumps(payload, sort_keys=True))
        else:
            print("Ruflo offline preflight: error\n- input: --expect-commit must be exactly 40 hexadecimal characters")
        return 2

    checks: list[dict[str, Any]] = []
    os_name = platform.system() or "unknown"
    arch = platform.machine() or "unknown"
    checks.append(check("host", "ok", "host facts observed without starting Ruflo", os=os_name, arch=arch, release=platform.release() or "unknown"))
    py = sys.version_info
    py_text = f"{py.major}.{py.minor}.{py.micro}"
    py_ok = (py.major, py.minor) >= (3, 10)
    checks.append(check("python", "ok" if py_ok else "blocked", f"Python {py_text}; helper requires Python 3.10+", version=py_text, minimum="3.10"))
    for tool in REQUIRED_TOOLS:
        path = shutil.which(tool)
        name = "vcs" if tool == "git" else ("claude_host" if tool == "claude" else tool)
        checks.append(check(name, "ok" if path else "blocked", "executable discoverable; version unverified because it was not invoked" if path else f"{tool} executable not discoverable", path=path))
    checks.append(check("platform", "ok" if os_name in {"Darwin", "Linux", "Windows"} else "info", "platform has documented primary host family" if os_name in {"Darwin", "Linux", "Windows"} else "platform is outside documented primary host families; no readiness inferred", os=os_name))
    checks.append(check("side_effect_boundary", "info", "preflight does not run Ruflo, Claude Code, npm, npx, hooks, MCP servers, benchmarks, providers, downloads, network calls, or config writes; runtime behavior remains unverified"))
    if args.repo is not None:
        inspect_repo(args.repo, args.expect_commit, checks)

    blocked = any(item["status"] in {"blocked", "unsafe-symlink", "oversized"} for item in checks)
    overall = "blocked" if blocked else "ok"
    payload = result(overall, checks)
    if args.json:
        print(json.dumps(payload, sort_keys=True))
    else:
        print(f"Ruflo offline preflight: {overall}")
        for item in checks:
            if item["status"] != "info":
                print(f"- {item['name']}: {item['detail']}")
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
