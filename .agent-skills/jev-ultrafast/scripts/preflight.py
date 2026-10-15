#!/usr/bin/env python3
"""Read-only offline preflight for the pinned Jev Ultrafast project."""
from __future__ import annotations

import argparse
import importlib.metadata as metadata
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path, PurePosixPath

SKILL = "jev-ultrafast"
SCOPE = "offline-preflight"
MIN_PYTHON = (3, 12)
PINNED_BROWSER_HARNESS = "0.1.13"
SHA = re.compile(r"^[0-9a-fA-F]{40}$")
SOURCE_FILES = (
    "README.md",
    "LICENSE",
    "pyproject.toml",
    ".env.example",
    "jev_ultrafast/__init__.py",
    "jev_ultrafast/agent.py",
    "jev_ultrafast/browser.py",
    "jev_ultrafast/model.py",
    "jev_ultrafast/demo.py",
    "jev_ultrafast/snapshot.js",
    "examples/run.py",
    "examples/flights.py",
    "scripts/check_guards.py",
    "tests/test_agent.py",
)
SOURCE_DIRS = ("jev_ultrafast", "examples", "scripts", "tests")


class InputError(ValueError):
    """Invalid command-line input with machine-readable reporting."""


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)


def parser() -> argparse.ArgumentParser:
    result = Parser(
        prog="preflight.py",
        description="Offline Jev Ultrafast prerequisite and local source preflight.",
        allow_abbrev=False,
    )
    result.add_argument("--json", action="store_true", help="emit one JSON result object")
    result.add_argument("--repo", type=Path, metavar="PATH", help="local Jev Ultrafast checkout to inspect")
    result.add_argument(
        "--expect-commit",
        metavar="FULL_SHA",
        help="compare local HEAD with a full 40-hex SHA; requires --repo",
    )
    return result


def item(name: str, status: str, detail: str, required: bool = False) -> dict[str, object]:
    return {"name": name, "status": status, "required": required, "detail": detail}


def version_tuple(value: str) -> tuple[int, ...] | None:
    match = re.match(r"^\s*(\d+(?:\.\d+)*)", value)
    if not match:
        return None
    return tuple(int(part) for part in match.group(1).split("."))


def prerelease(value: str) -> bool:
    return bool(re.search(r"(?:a|b|rc|dev)\d*\s*$", value, re.IGNORECASE))


def distribution(
    name: str,
    *,
    exact: str | None = None,
    minimum: tuple[int, ...] | None = None,
    maximum: tuple[int, ...] | None = None,
) -> tuple[dict[str, object], bool]:
    try:
        found = metadata.version(name)
    except metadata.PackageNotFoundError:
        return item(f"distribution:{name}", "missing", "distribution metadata not found", True), True
    except Exception as exc:
        return item(f"distribution:{name}", "error", f"metadata unavailable: {type(exc).__name__}", True), True

    parsed = version_tuple(found)
    mismatch = exact is not None and found.strip() != exact
    mismatch = mismatch or parsed is None
    mismatch = mismatch or (minimum is not None and (prerelease(found) or parsed is None or parsed < minimum))
    mismatch = mismatch or (maximum is not None and (parsed is None or parsed >= maximum))
    detail = f"detected version {found}"
    if mismatch:
        if exact is not None:
            detail += f"; requires == {exact}"
        elif minimum is not None and maximum is not None:
            detail += f"; requires >= {'.'.join(map(str, minimum))} and < {'.'.join(map(str, maximum))}"
    return item(f"distribution:{name}", "mismatch" if mismatch else "detected", detail, True), bool(mismatch)


def safe_git(repo: Path, *args: str) -> tuple[str | None, str | None]:
    git_bin = shutil.which("git")
    if git_bin is None:
        return None, "git not found on PATH"

    # Pass only portable process variables. Inherited Git selectors, tracing,
    # credentials, configuration, prompts, and protocol settings are excluded.
    env: dict[str, str] = {}
    for key in ("PATH", "SYSTEMROOT", "WINDIR", "PATHEXT", "TEMP", "TMP", "TMPDIR"):
        value = os.environ.get(key)
        if value:
            env[key] = value
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
        git_bin,
        "-c",
        "protocol.allow=never",
        "-c",
        "core.pager=cat",
        "-C",
        str(repo),
        *args,
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
            env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, type(exc).__name__
    if result.returncode:
        detail = (result.stderr or f"git exited {result.returncode}").strip()
        return None, detail[:180]
    return result.stdout.strip(), None


def public_path(root: Path, relative: str, *, directory: bool) -> tuple[str, str]:
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            return "missing", f"missing public source path: {relative}"
        except OSError as exc:
            return "error", f"cannot inspect public source path {relative}: {type(exc).__name__}"
        if stat.S_ISLNK(info.st_mode):
            return "mismatch", f"symlinked public source path rejected: {relative}"
    expected = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not expected:
        label = "directory" if directory else "regular file"
        return "mismatch", f"public source path is not a {label}: {relative}"
    return "detected", f"public source path present: {relative}"


def checkout(path: Path, expected: str | None) -> tuple[list[dict[str, object]], bool]:
    checks: list[dict[str, object]] = []
    requested = path.expanduser()
    absolute = Path(os.path.abspath(requested))
    current = Path(absolute.anchor)
    try:
        component = os.lstat(current)
        for part in absolute.parts[1:]:
            current = current / part
            component = os.lstat(current)
            if stat.S_ISLNK(component.st_mode):
                return [item("repo", "mismatch", f"symlinked checkout path component rejected: {current}", True)], True
    except FileNotFoundError:
        return [item("repo", "missing", f"checkout path does not exist: {absolute}", True)], True
    except OSError as exc:
        return [item("repo", "error", f"cannot inspect checkout path: {type(exc).__name__}", True)], True
    if not stat.S_ISDIR(component.st_mode):
        return [item("repo", "mismatch", "checkout path is not a directory", True)], True

    try:
        resolved = absolute.resolve(strict=True)
    except OSError as exc:
        return [item("repo", "error", f"cannot resolve checkout path: {type(exc).__name__}", True)], True
    checks.append(item("repo", "detected", f"local directory {resolved}", True))

    inside, error = safe_git(resolved, "rev-parse", "--is-inside-work-tree")
    if inside != "true":
        detail = error or (inside if inside else "not a Git work tree")
        return checks + [item("repo.git", "mismatch", detail[:180], True)], True
    checks.append(item("repo.git", "detected", "local Git work tree", True))

    top, error = safe_git(resolved, "rev-parse", "--show-toplevel")
    if top is None:
        return checks + [item("repo.root", "error", f"cannot resolve Git top-level: {error}", True)], True
    try:
        git_root = Path(top).resolve(strict=True)
    except OSError as exc:
        return checks + [item("repo.root", "error", f"cannot resolve Git root: {type(exc).__name__}", True)], True
    if git_root != resolved:
        return checks + [item("repo.root", "mismatch", f"Git root {git_root} does not match requested root {resolved}", True)], True
    checks.append(item("repo.root", "matched", f"Git root matches {resolved}", True))

    head, error = safe_git(resolved, "rev-parse", "--verify", "HEAD")
    if head is None or not SHA.fullmatch(head):
        detail = error or "Git did not return a full 40-hex HEAD"
        return checks + [item("repo.commit", "error", detail[:180], True)], True
    checks.append(item("repo.commit", "detected", f"local HEAD {head}", True))
    if expected is not None:
        if head.lower() != expected.lower():
            checks.append(item("repo.expected_commit", "mismatch", f"HEAD does not match expected {expected}", True))
            return checks, True
        checks.append(item("repo.expected_commit", "matched", "local HEAD matches the requested full SHA", True))

    missing = False
    for marker in SOURCE_DIRS:
        status, detail = public_path(resolved, marker, directory=True)
        checks.append(item(f"repo.dir:{marker}", status, detail, True))
        missing = missing or status != "detected"
    for marker in SOURCE_FILES:
        status, detail = public_path(resolved, marker, directory=False)
        checks.append(item(f"repo.file:{marker}", status, detail, True))
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
        args = parser().parse_args(raw)
    except InputError as exc:
        emit("error", [item("arguments", "error", str(exc), True)], as_json)
        return 2

    if args.expect_commit is not None and args.repo is None:
        emit("error", [item("arguments", "error", "--expect-commit requires --repo", True)], as_json)
        return 2
    if args.expect_commit is not None and not SHA.fullmatch(args.expect_commit):
        emit(
            "error",
            [item("arguments", "error", "--expect-commit must be a full 40-hex SHA", True)],
            as_json,
        )
        return 2

    checks: list[dict[str, object]] = []
    python_ok = sys.version_info[:2] >= MIN_PYTHON
    python_version = platform.python_version()
    checks.append(
        item(
            "python",
            "detected" if python_ok else "mismatch",
            f"running {python_version}; requires >= {MIN_PYTHON[0]}.{MIN_PYTHON[1]}",
            True,
        )
    )
    checks.append(item("host", "detected", f"{platform.system()} {platform.machine()}"))

    uv = shutil.which("uv")
    checks.append(item("tool:uv", "detected" if uv else "missing", f"found at {uv}" if uv else "uv not found on PATH", True))
    browser_harness, harness_bad = distribution("browser-harness", exact=PINNED_BROWSER_HARNESS)
    httpx, httpx_bad = distribution("httpx", minimum=(0, 28), maximum=(1,))
    checks.extend((browser_harness, httpx))

    chrome = next((shutil.which(name) for name in ("google-chrome", "chromium", "chromium-browser", "chrome") if shutil.which(name)), None)
    checks.append(
        item(
            "tool:chrome",
            "detected" if chrome else "not-on-path",
            f"found at {chrome}" if chrome else "no Chrome/Chromium executable found on PATH; an existing Browser Harness session is not inspected",
        )
    )

    repo_bad = False
    if args.repo is None:
        checks.append(item("repo", "skipped", "no --repo supplied; local source checkout was not inspected"))
    else:
        repo_checks, repo_bad = checkout(args.repo, args.expect_commit)
        checks.extend(repo_checks)

    blocked = not python_ok or uv is None or harness_bad or httpx_bad or repo_bad
    emit("blocked" if blocked else "ok", checks, args.json)
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
