#!/usr/bin/env python3
"""Offline, non-mutating preflight for mksglu/context-mode."""

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

SKILL = "context-mode"
PUBLIC_FILES = (
    "package.json",
    "src/server.ts",
    "src/cli.ts",
    "docs/platform-support.md",
    "scripts/postinstall.mjs",
    "LICENSE",
)
SHA = re.compile(r"^[0-9a-fA-F]{40}$")


def check(name: str, status: str, detail: str, blocking: bool = False) -> dict[str, Any]:
    return {"name": name, "status": status, "detail": detail, "blocking": blocking}
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Inspect context-mode prerequisites without executing it.")
    parser.add_argument("--json", action="store_true", help="emit one JSON result object")
    parser.add_argument("--repo", type=Path, help="local context-mode source checkout to inspect")
    parser.add_argument("--expect-commit", help="full 40-hex commit to compare when --repo is supplied")
    return parser
def invalid(message: str) -> tuple[dict[str, Any], int]:
    return ({"skill": SKILL, "scope": "offline-preflight", "status": "error",
             "checks": [check("input", "invalid", message, True)], "runtime_verified": False}, 2)
def inspect_repo(repo: Path, expected: str | None, checks: list[dict[str, Any]]) -> None:
    missing = [name for name in PUBLIC_FILES if (repo / name).is_symlink() or not (repo / name).is_file()]
    if missing:
        checks.append(check("source_shape", "missing", "missing public files: " + ", ".join(missing), True))
    else:
        checks.append(check("source_shape", "ok", "required public source files are present"))

    package = repo / "package.json"
    if package.is_symlink():
        checks.append(check("package_metadata", "invalid", "package.json must be a regular non-symlink file", True))
    elif package.is_file():
        try:
            if package.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("package.json exceeds 2 MiB bound")
            metadata = json.loads(package.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, ValueError) as exc:
            checks.append(check("package_metadata", "error", f"cannot parse package.json: {exc}", True))
        else:
            if isinstance(metadata, dict) and isinstance(metadata.get("name"), str) and isinstance(metadata.get("version"), str):
                checks.append(check("package_metadata", "ok", f"name={metadata['name']}; version={metadata['version']}"))
            else:
                checks.append(check("package_metadata", "invalid", "package.json lacks string name/version", True))

    git = shutil.which("git")
    if not git:
        checks.append(check("source_commit", "unavailable", "git is not on PATH; commit was not inspected", True))
        return
    try:
        env = {key: os.environ[key] for key in ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR") if key in os.environ}
        env.update({
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_ALLOW_PROTOCOL": "",
        })
        result = subprocess.run(
            [git, "-C", str(repo), "rev-parse", "--show-toplevel", "--verify", "HEAD"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
            shell=False,
            env=env,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        checks.append(check("source_commit", "error", f"bounded local git inspection failed: {exc}", True))
        return
    lines = result.stdout.splitlines()
    if result.returncode != 0 or len(lines) != 2:
        checks.append(check("source_commit", "unavailable", "repository HEAD commit could not be read", True))
        return
    try:
        top_level = Path(lines[0].strip()).expanduser().resolve()
    except OSError as exc:
        checks.append(check("source_commit", "error", f"Git toplevel could not be resolved: {exc}", True))
        return
    if top_level != repo:
        checks.append(check("source_commit", "mismatch", f"Git toplevel={top_level}; expected={repo}", True))
        return
    commit = lines[1].strip()
    if not SHA.fullmatch(commit):
        checks.append(check("source_commit", "unavailable", "repository HEAD commit could not be read", True))
        return
    if expected and commit.lower() != expected.lower():
        checks.append(check("source_commit", "mismatch", f"HEAD={commit}; expected={expected}", True))
    else:
        detail = f"HEAD={commit}"
        if expected:
            detail += "; matches caller-provided expectation"
        checks.append(check("source_commit", "ok", detail))
def run(argv: list[str]) -> tuple[dict[str, Any], int]:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        if exc.code == 0:
            raise
        return invalid("argument parsing failed")
    if args.expect_commit is not None and not SHA.fullmatch(args.expect_commit):
        return invalid("--expect-commit must be a full 40-hex commit")
    if args.expect_commit is not None and args.repo is None:
        return invalid("--expect-commit requires --repo")
    if args.repo is not None:
        try:
            repo = args.repo.expanduser().resolve()
        except OSError as exc:
            return invalid(f"cannot resolve --repo: {exc}")
        if not repo.is_dir():
            return invalid("--repo must name an existing directory")
    else:
        repo = None

    checks: list[dict[str, Any]] = []
    py = sys.version_info
    checks.append(check("python", "ok" if py >= (3, 10) else "blocked",
                        f"Python {py.major}.{py.minor}.{py.micro}", py < (3, 10)))
    checks.append(check("host", "ok", f"{platform.system()} {platform.release()} on {platform.machine()}"))

    paths = {name: shutil.which(name) for name in ("node", "npm", "npx", "bun", "context-mode")}
    for name, path in paths.items():
        checks.append(check(f"tool:{name}", "present" if path else "missing",
                            path or "not found; no executable was run"))

    runtimes = [name for name in ("node", "bun") if paths[name]]
    if runtimes:
        detail = "; ".join(f"{name}={paths[name]}" for name in runtimes)
        detail += "; executable not run, required Node >=22.5.0/Bun version remains unverified"
        checks.append(check("runtime_version", "unverified", detail))
    else:
        checks.append(check("runtime_version", "missing", "neither Node nor Bun is on PATH", True))

    if repo is None:
        checks.append(check("source", "skipped", "pass --repo to inspect public source shape and commit"))
    else:
        inspect_repo(repo, args.expect_commit, checks)

    blocked = any(item.get("blocking") for item in checks)
    result = {"skill": SKILL, "scope": "offline-preflight", "status": "blocked" if blocked else "ok",
              "checks": checks, "runtime_verified": False}
    return result, 1 if blocked else 0
def main(argv: list[str] | None = None) -> int:
    raw = sys.argv[1:] if argv is None else argv
    try:
        result, code = run(raw)
    except SystemExit:
        raise
    except Exception as exc:  # keep unexpected local inspection failures explicit
        result, code = ({"skill": SKILL, "scope": "offline-preflight", "status": "error",
                         "checks": [check("preflight", "error", str(exc), True)],
                         "runtime_verified": False}, 2)
    if "--json" in raw:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"{SKILL} offline preflight: {result['status']}")
        for item in result["checks"]:
            print(f"- {item['name']}: {item['status']} ({item['detail']})")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
