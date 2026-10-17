#!/usr/bin/env python3
"""Read-only offline preflight for the pinned OpenCreator source project."""
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
from pathlib import Path, PurePosixPath

SKILL = "opencreator"
SCOPE = "offline-preflight"
PINNED_COMMIT = "b01a9f71165b9010216e25c462653b0cfa33cbce"
SHA = re.compile(r"^[0-9a-fA-F]{40}$")
MAX_PUBLIC_FILE_BYTES = 10_000_000
SOURCE_FILES = (
    "README.md",
    "LICENSE",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "docs/contributing/skills-contributing.md",
    "apps/web/package.json",
    "apps/desktop/package.json",
    "apps/daemon/package.json",
    "packages/protocol/package.json",
    "packages/skill-market/package.json",
    "skills/krillinai-tts/SKILL.md",
)
SOURCE_DIRS = (
    "apps/web",
    "apps/desktop",
    "apps/daemon",
    "packages/protocol",
    "packages/skill-market",
    "skills",
)
PORTABLE_ENV = (
    "PATH",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
)


class InputError(ValueError):
    """Invalid command-line input with machine-readable reporting."""


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)


def make_parser() -> argparse.ArgumentParser:
    result = Parser(
        prog="preflight.py",
        description="Offline OpenCreator host and local source preflight.",
        allow_abbrev=False,
    )
    result.add_argument("--json", action="store_true", help="emit one JSON result object")
    result.add_argument("--repo", type=Path, metavar="PATH", help="local OpenCreator checkout to inspect")
    result.add_argument(
        "--expect-commit",
        metavar="FULL_SHA",
        help="compare local HEAD with a full 40-hex SHA; requires --repo",
    )
    return result


def check(name: str, status: str, detail: str, required: bool = False) -> dict[str, object]:
    return {"name": name, "status": status, "required": required, "detail": detail}


def safe_git(repo: Path, *args: str) -> tuple[str | None, str | None]:
    found = shutil.which("git")
    if found is None:
        return None, "git not found on PATH"
    try:
        git_binary = Path(found).resolve(strict=True)
        info = os.stat(git_binary)
    except OSError as exc:
        return None, f"cannot resolve git: {type(exc).__name__}"
    if not stat.S_ISREG(info.st_mode) or not os.access(git_binary, os.X_OK):
        return None, "git on PATH is not an executable regular file"

    # Do not pass inherited Git selectors, traces, credentials, configuration,
    # prompts, or provider variables to the child process.
    env = {key: os.environ[key] for key in PORTABLE_ENV if os.environ.get(key)}
    env.update(
        {
            "GIT_ALLOW_PROTOCOL": "",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_PAGER": "cat",
            "GIT_TERMINAL_PROMPT": "0",
            "PAGER": "cat",
        }
    )
    command = [
        str(git_binary),
        "-c",
        "protocol.allow=never",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=" + os.devnull,
        "-c",
        "core.pager=cat",
        "-c",
        "credential.helper=",
        "-c",
        "maintenance.auto=false",
        "-c",
        "gc.auto=0",
        "-C",
        str(repo),
        *args,
    ]
    try:
        result = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            env=env,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return None, type(exc).__name__
    if result.returncode != 0:
        return None, f"git exited with status {result.returncode}"
    return result.stdout.rstrip("\r\n"), None


def public_path(root: Path, relative: str, *, directory: bool) -> tuple[str, str]:
    rel = PurePosixPath(relative)
    if rel.is_absolute() or any(part in ("", ".", "..") for part in rel.parts):
        return "mismatch", f"invalid bundled source marker: {relative}"

    current = root
    info = None
    for index, part in enumerate(rel.parts):
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            return "missing", f"missing public source path: {relative}"
        except OSError as exc:
            return "error", f"cannot inspect public source path: {type(exc).__name__}"
        if stat.S_ISLNK(info.st_mode):
            return "mismatch", f"symlinked public source path rejected: {relative}"
        if index < len(rel.parts) - 1 and not stat.S_ISDIR(info.st_mode):
            return "mismatch", f"non-directory source path component: {relative}"

    assert info is not None
    expected_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not expected_type:
        expected = "directory" if directory else "regular file"
        return "mismatch", f"public source path is not a {expected}: {relative}"
    if not directory and info.st_size > MAX_PUBLIC_FILE_BYTES:
        return "mismatch", f"public source marker exceeds the {MAX_PUBLIC_FILE_BYTES}-byte limit: {relative}"
    kind = "directory" if directory else "file"
    return "detected", f"public source {kind} present: {relative}"


def inspect_checkout(path: Path, expected: str | None) -> tuple[list[dict[str, object]], bool]:
    checks: list[dict[str, object]] = []
    try:
        requested = path.expanduser()
        absolute = Path(os.path.abspath(requested))
    except (OSError, RuntimeError, ValueError) as exc:
        return [check("repo", "error", f"cannot resolve requested path: {type(exc).__name__}", True)], True
    if "\n" in str(absolute) or "\r" in str(absolute):
        return [check("repo", "mismatch", "newline characters are not allowed in the checkout path", True)], True
    try:
        info = os.lstat(absolute)
    except FileNotFoundError:
        return [check("repo", "missing", f"checkout path does not exist: {absolute}", True)], True
    except OSError as exc:
        return [check("repo", "error", f"cannot inspect checkout path: {type(exc).__name__}", True)], True
    if stat.S_ISLNK(info.st_mode):
        return [check("repo", "mismatch", "symlinked checkout path rejected", True)], True
    if not stat.S_ISDIR(info.st_mode):
        return [check("repo", "mismatch", "checkout path is not a directory", True)], True
    try:
        root = absolute.resolve(strict=True)
    except OSError as exc:
        return [check("repo", "error", f"cannot resolve checkout path: {type(exc).__name__}", True)], True
    checks.append(check("repo", "detected", f"local directory {root}", True))

    inside, error = safe_git(root, "rev-parse", "--is-inside-work-tree")
    if inside != "true":
        detail = error or "not a Git working tree"
        return checks + [check("repo.git", "mismatch", detail, True)], True
    checks.append(check("repo.git", "detected", "local Git working tree", True))

    top, error = safe_git(root, "rev-parse", "--show-toplevel")
    if top is None:
        return checks + [check("repo.root", "error", f"cannot resolve Git top-level: {error}", True)], True
    try:
        git_root = Path(top).resolve(strict=True)
    except OSError as exc:
        return checks + [check("repo.root", "error", f"cannot resolve Git root: {type(exc).__name__}", True)], True
    if git_root != root:
        return checks + [
            check("repo.root", "mismatch", "resolved Git top-level does not match the requested repository root", True)
        ], True
    checks.append(check("repo.root", "matched", "resolved Git top-level matches the requested root", True))

    head, error = safe_git(root, "rev-parse", "--verify", "HEAD")
    if head is None or not SHA.fullmatch(head):
        detail = error or "Git did not return a full 40-hex HEAD"
        return checks + [check("repo.commit", "error", detail, True)], True
    checks.append(check("repo.commit", "detected", f"local HEAD {head}", True))
    if expected is None:
        checks.append(
            check(
                "repo.expected_commit",
                "skipped",
                f"no pin supplied; this guide is pinned to {PINNED_COMMIT}",
            )
        )
    elif head.lower() != expected.lower():
        checks.append(check("repo.expected_commit", "mismatch", "local HEAD does not match the requested full SHA", True))
        return checks, True
    else:
        checks.append(check("repo.expected_commit", "matched", "local HEAD matches the requested full SHA", True))

    missing = False
    for marker in SOURCE_DIRS:
        status, detail = public_path(root, marker, directory=True)
        checks.append(check(f"repo.dir:{marker}", status, detail, True))
        missing = missing or status != "detected"
    for marker in SOURCE_FILES:
        status, detail = public_path(root, marker, directory=False)
        checks.append(check(f"repo.file:{marker}", status, detail, True))
        missing = missing or status != "detected"
    return checks, missing


def emit(status: str, checks: list[dict[str, object]], as_json: bool) -> None:
    report = {
        "skill": SKILL,
        "scope": SCOPE,
        "status": status,
        "checks": checks,
        "runtime_verified": False,
    }
    if as_json:
        print(json.dumps(report, sort_keys=True))
        return
    print(f"{SKILL} {SCOPE}: {status} (runtime_verified=false)")
    for entry in checks:
        requirement = " required" if entry["required"] else " optional"
        print(f"- {entry['name']}: {entry['status']}{requirement} - {entry['detail']}")


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in raw
    try:
        args = make_parser().parse_args(raw)
    except InputError as exc:
        emit("error", [check("arguments", "error", str(exc), True)], as_json)
        return 2

    if args.expect_commit is not None and args.repo is None:
        emit("error", [check("arguments", "error", "--expect-commit requires --repo", True)], args.json)
        return 2
    if args.expect_commit is not None and not SHA.fullmatch(args.expect_commit):
        emit(
            "error",
            [check("arguments", "error", "--expect-commit must be a full 40-hex SHA", True)],
            args.json,
        )
        return 2

    checks: list[dict[str, object]] = [
        check("python", "detected", f"running {platform.python_version()}"),
        check("host", "detected", f"{platform.system()} {platform.machine()}"),
        check("runtime", "not-verified", "OpenCreator, Codex, providers, and creator tasks are not executed"),
    ]
    if args.repo is None:
        checks.append(check("repo", "skipped", "no --repo supplied; local source checkout was not inspected"))
        blocked = False
    else:
        repo_checks, blocked = inspect_checkout(args.repo, args.expect_commit)
        checks.extend(repo_checks)

    emit("blocked" if blocked else "ok", checks, args.json)
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
