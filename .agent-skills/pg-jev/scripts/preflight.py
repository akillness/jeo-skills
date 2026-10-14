#!/usr/bin/env python3
"""Offline, read-only prerequisite and pinned-source audit for pg-jev."""
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

SKILL = "pg-jev"
FILES = ("jev.control", "sql/jev--0.2.1.sql", "Makefile", "README.md", "LICENSE")
SHA = re.compile(r"^[0-9a-fA-F]{40}$")

class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ValueError(message)


def item(name: str, status: str, detail: str, **extra: object) -> dict[str, object]:
    result: dict[str, object] = {"name": name, "status": status, "detail": detail}
    result.update(extra)
    return result


def envelope(status: str, checks: list[dict[str, object]]) -> dict[str, object]:
    return {"skill": SKILL, "scope": "offline-preflight", "status": status,
            "checks": checks, "runtime_verified": False}


def args_for(argv: list[str]) -> argparse.Namespace:
    parser = Parser(
        description="Audit pg-jev host tools and an optional local source checkout without contacting PostgreSQL."
    )
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", metavar="PATH", help="local pg-jev source checkout to audit")
    parser.add_argument("--expect-commit", metavar="FULL_SHA",
                        help="compare local HEAD with this 40-hex commit (requires --repo)")
    args, unknown = parser.parse_known_args(argv)
    if unknown:
        raise ValueError(f"unrecognized arguments: {' '.join(unknown)}")
    return args


def audit(args: argparse.Namespace) -> tuple[dict[str, object], int]:
    checks: list[dict[str, object]] = []
    version = sys.version_info
    py = f"Python {version.major}.{version.minor}.{version.micro}"
    checks.append(item("python", "ok" if version >= (3, 10) else "blocked",
                       f"{py} is running the helper" if version >= (3, 10)
                       else f"{py} is below the required 3.10", version=f"{version.major}.{version.minor}.{version.micro}"))
    system, arch = platform.system(), platform.machine()
    checks.append(item("host", "ok", f"host={system} arch={arch}", system=system, architecture=arch))

    for tool in ("pg_config", "make", "psql", "git"):
        path = shutil.which(tool)
        checks.append(item(f"tool:{tool}", "ok", f"available at {path}", path=path)
                      if path else item(f"tool:{tool}", "blocked", f"{tool} was not found on PATH"))

    if args.expect_commit is not None and args.repo is None:
        checks = [item("arguments", "error", "--expect-commit requires --repo")]
        return envelope("error", checks), 2

    if args.repo is None:
        checks.append(item("source", "ok", "no --repo supplied; local source structural audit skipped"))
    else:
        repo = Path(args.repo).expanduser()
        if not repo.is_dir():
            checks.append(item("repo", "blocked", f"source path is not an existing directory: {repo}"))
        else:
            checks.append(item("repo", "ok", f"auditing local source checkout {repo}"))
            for relative in FILES:
                path = repo / relative
                checks.append(item(f"source:{relative}", "ok", "required public structural file is present")
                              if path.is_file() else item(f"source:{relative}", "blocked",
                                                           "required public structural file is missing"))
            git_path = shutil.which("git")
            if git_path is None:
                checks.append(item("source:git-head", "blocked", "git was not found on PATH"))
            else:
                try:
                    resolved_repo = repo.resolve()
                    safe_env = {key: os.environ[key] for key in
                                ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
                                if key in os.environ}
                    safe_env.update({"GIT_ALLOW_PROTOCOL": "", "GIT_TERMINAL_PROMPT": "0",
                                     "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1",
                                     "GIT_CONFIG_GLOBAL": os.devnull})
                    result = subprocess.run(
                        [git_path, "-C", str(resolved_repo), "rev-parse", "--show-toplevel", "--verify", "HEAD"],
                        capture_output=True, text=True, timeout=5, check=False, env=safe_env,
                    )
                    values = result.stdout.splitlines()
                    top = Path(values[0]).resolve() if values else None
                    head = values[-1].strip() if values else ""
                    if result.returncode == 0 and top == resolved_repo and SHA.fullmatch(head):
                        checks.append(item("source:git-head", "ok", f"local HEAD is {head}", commit=head))
                        if args.expect_commit is not None:
                            checks.append(item("source:commit-pin", "ok", "local HEAD matches --expect-commit")
                                          if head.lower() == args.expect_commit.lower() else
                                          item("source:commit-pin", "blocked",
                                               f"local HEAD {head} does not match --expect-commit {args.expect_commit}",
                                               expected_commit=args.expect_commit, actual_commit=head))
                    else:
                        detail = result.stderr.strip() or "path is not a Git checkout rooted at --repo with a readable HEAD"
                        if result.returncode == 0 and top != resolved_repo:
                            detail = f"git resolved source root {top} outside --repo {resolved_repo}"
                        checks.append(item("source:git-head", "blocked", detail))
                except (OSError, subprocess.TimeoutExpired) as exc:
                    checks.append(item("source:git-head", "blocked", f"bounded git rev-parse failed: {exc}"))

    blocked = any(check["status"] == "blocked" for check in checks)
    return envelope("blocked" if blocked else "ok", checks), 1 if blocked else 0


def emit(result: dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, sort_keys=True))
        return
    print(f"{result['skill']} offline preflight: {result['status']}")
    for check in result["checks"]:  # type: ignore[union-attr]
        print(f"- {check['name']}: {check['status']} — {check['detail']}")  # type: ignore[index]
    print("- runtime_verified: false (no PostgreSQL/provider session was opened)")


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    wants_json = "--json" in raw
    try:
        args = args_for(raw)
    except ValueError as exc:
        emit(envelope("error", [item("arguments", "error", str(exc))]), wants_json)
        return 2
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 2
    if args.expect_commit is not None and not SHA.fullmatch(args.expect_commit):
        emit(envelope("error", [item("arguments", "error",
                                      "--expect-commit must be exactly 40 hexadecimal characters")]), wants_json)
        return 2
    result, code = audit(args)
    emit(result, args.json)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
