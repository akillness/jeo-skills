#!/usr/bin/env python3
"""Offline, data-safe preflight for a Helix Foundry checkout."""
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
from typing import Any

SKILL = "helix-foundry"
SCOPE = "offline-preflight"
FULL_SHA = re.compile(r"^[0-9a-fA-F]{40}$")
PUBLIC_PATHS = (
    "README.md", "AGENTS.md", "compose.yaml", "package.json", "LICENSE",
    "docs/API.md", "docs/OPERATIONS.md", "docs/HOSTING.md",
    "apps/api/src/app.ts", "apps/api/src/store.ts",
    "scripts/setup.sh", "scripts/backup.sh", "scripts/restore.sh", "scripts/upgrade.sh",
)

def cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="preflight.py", description="Offline Helix Foundry host and public-checkout preflight.", add_help=False)
    parser.add_argument("--help", action="store_true", help="show this help")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", metavar="PATH", help="local checkout to inspect")
    parser.add_argument("--expect-commit", metavar="FULL_SHA", help="compare repo HEAD to this full SHA")
    return parser

def report(status: str = "ok") -> dict[str, Any]:
    return {"skill": SKILL, "scope": SCOPE, "status": status, "checks": [], "runtime_verified": False}

def check(data: dict[str, Any], name: str, status: str, detail: str, **extra: str) -> None:
    item: dict[str, Any] = {"name": name, "status": status, "detail": detail}
    item.update(extra)
    data["checks"].append(item)
    if status == "blocked" and data["status"] == "ok":
        data["status"] = "blocked"

def binary(data: dict[str, Any], name: str, required: bool = True) -> str | None:
    path = shutil.which(name)
    if path:
        check(data, name, "ok", "executable candidate found", path=path)
    else:
        check(data, name, "blocked" if required else "unverified", "executable not found" if required else "optional executable not found")
    return path

def git_run(root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    safe = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
    env = {key: os.environ[key] for key in safe if key in os.environ}
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    return subprocess.run([shutil.which("git") or "git", *args], cwd=str(root), env=env, capture_output=True, text=True, check=False, timeout=3)

def host(data: dict[str, Any]) -> None:
    system, machine = platform.system() or "unknown", platform.machine() or "unknown"
    state = "ok" if (system, machine.lower()) == ("Darwin", "arm64") else "unverified"
    detail = "validated Apple Silicon host" if state == "ok" else "validated target is Darwin/arm64; host is not that pair"
    check(data, "host", state, detail, os=system, arch=machine)
    version = sys.version_info
    check(data, "python", "ok" if version >= (3, 10) else "blocked", "Python 3.10+" if version >= (3, 10) else "Python 3.10+ is required", version=platform.python_version())
    docker = binary(data, "docker")
    compose = binary(data, "docker-compose", required=False)
    if compose:
        check(data, "compose_candidate", "ok", "docker-compose executable candidate found; daemon/plugin unverified", path=compose)
    elif docker:
        check(data, "compose_candidate", "unverified", "docker CLI found; Compose v2 plugin not probed offline")
    else:
        check(data, "compose_candidate", "blocked", "neither docker nor docker-compose executable candidate found")
    for name in ("git", "bash", "openssl"):
        binary(data, name)
    for name in ("node", "pnpm"):
        binary(data, name, required=False)

def repo(data: dict[str, Any], value: str, expected: str | None) -> None:
    root = Path(value)
    try:
        is_directory, resolved = root.is_dir(), root.resolve()
        missing = [path for path in PUBLIC_PATHS if not (root / path).is_file()]
    except (OSError, ValueError) as exc:
        raise ValueError(f"--repo cannot be inspected: {exc}") from exc
    if not is_directory:
        raise ValueError("--repo must name an existing directory")
    if missing:
        check(data, "source_shape", "blocked", "missing required public source paths", missing=", ".join(missing))
    else:
        check(data, "source_shape", "ok", "required public source paths present; file contents not read", paths=str(len(PUBLIC_PATHS)))
    try:
        top_proc = git_run(root, ["rev-parse", "--show-toplevel"])
        head_proc = git_run(root, ["rev-parse", "--verify", "HEAD"])
    except (OSError, subprocess.SubprocessError) as exc:
        check(data, "source_commit", "blocked", f"local git rev-parse failed: {exc}")
        return
    if top_proc.returncode:
        check(data, "source_commit", "blocked", "git show-toplevel could not resolve the requested checkout")
        return
    try:
        top = Path(top_proc.stdout.strip()).resolve()
    except (OSError, ValueError) as exc:
        check(data, "source_commit", "blocked", f"git show-toplevel could not be inspected: {exc}")
        return
    if top != resolved:
        check(data, "source_commit", "blocked", "git show-toplevel does not match the requested checkout")
        return
    head = head_proc.stdout.strip()
    if head_proc.returncode or not FULL_SHA.fullmatch(head):
        check(data, "source_commit", "blocked", head_proc.stderr.strip() or "local checkout has no verifiable HEAD")
    elif expected is None:
        check(data, "source_commit", "unverified", "HEAD observed; no --expect-commit supplied", head=head)
    elif head.lower() == expected.lower():
        check(data, "source_commit", "ok", "HEAD matches caller-provided expected commit", head=head)
    else:
        check(data, "source_commit", "blocked", "HEAD does not match caller-provided expected commit", head=head, expected=expected)

def emit(data: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        return
    print(f"{data['skill']} {data['scope']}: status={data['status']}")
    for item in data["checks"]:
        print(f"- {item['name']}: {item['status']} — {item['detail']}")
    print("- runtime_verified: false (offline evidence only)")

def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in raw
    parser = cli()
    if "--help" in raw:
        parser.print_help()
        return 0
    try:
        args = parser.parse_args(raw)
    except (argparse.ArgumentError, SystemExit):
        data = report("error")
        check(data, "arguments", "error", "invalid command-line arguments")
        emit(data, as_json)
        return 2
    data = report()
    if args.expect_commit is not None and (not args.repo or not FULL_SHA.fullmatch(args.expect_commit)):
        check(data, "arguments", "error", "--expect-commit requires --repo and a 40-character hexadecimal SHA")
        data["status"] = "error"
        emit(data, args.json)
        return 2
    try:
        host(data)
        if args.repo:
            repo(data, args.repo, args.expect_commit)
    except ValueError as exc:
        check(data, "arguments", "error", str(exc))
        data["status"] = "error"
        emit(data, args.json)
        return 2
    emit(data, args.json)
    return 1 if data["status"] == "blocked" else 0

if __name__ == "__main__":
    raise SystemExit(main())
