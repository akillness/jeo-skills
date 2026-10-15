#!/usr/bin/env python3
"""Read-only source-shape and commit preflight for okf-agent-memory."""

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

SKILL = "okf-agent-memory"
EXPECTED_COMMIT = "ad7beb01b9d4294d8dd28c25494d274374985b69"
MAX_MARKER_BYTES = 1_048_576
PUBLIC_MARKERS = (
    "README.md",
    "AGENTS.md",
    "go.mod",
    "LICENSE",
    "docs/guides/GETTING_STARTED.md",
    "docs/guides/CLI.md",
    "docs/security/SECURITY.md",
    ".agents/skills/okf-memory/SKILL.md",
)
APPROVED_ENV_KEYS = ("PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TZ")
PASSING = {"ok", "present", "declared"}
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")


def add(checks: list[dict[str, object]], name: str, status: str, details: str,
        required: bool = False) -> None:
    checks.append({"name": name, "status": status, "required": required, "details": details})


def invalid_payload(message: str) -> dict[str, object]:
    return {
        "skill": SKILL,
        "scope": "offline-preflight",
        "status": "error",
        "checks": [{"name": "arguments", "status": "error", "required": True, "details": message}],
        "runtime_verified": False,
    }


def approved_git_environment() -> dict[str, str]:
    # Deliberately exclude GIT_DIR, GIT_WORK_TREE, GIT_TRACE*, credentials,
    # provider tokens, arbitrary config selectors, and all other inherited keys.
    env = {key: os.environ[key] for key in APPROVED_ENV_KEYS if key in os.environ}
    env.update({
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_ALLOW_PROTOCOL": "",
    })
    return env


def git_head(repo: Path) -> tuple[str | None, str | None]:
    git = shutil.which("git")
    if not git:
        return None, "git-not-found"
    try:
        result = subprocess.run(
            [git, "-C", str(repo), "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel", "HEAD"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
            check=False,
            env=approved_git_environment(),
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return None, type(exc).__name__
    if result.returncode != 0:
        return None, "not-a-git-checkout"
    lines = result.stdout.splitlines()
    if len(lines) != 2 or Path(lines[0]).resolve() != repo.resolve():
        return None, "git-root-mismatch"
    head = lines[1].strip()
    return (head, None) if SHA_RE.fullmatch(head) else (None, "invalid-git-output")


def source_marker(repo: Path, relative: str) -> tuple[str, str]:
    rel = PurePosixPath(relative)
    if rel.is_absolute() or ".." in rel.parts:
        return "unsafe", "fixed marker path rejected"

    current = repo
    info = None
    for index, part in enumerate(rel.parts):
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            return "missing", "required public source marker is absent"
        except OSError:
            return "unreadable", "required public source marker could not be inspected"
        if stat.S_ISLNK(info.st_mode):
            return "unsafe-symlink", "symlinked source path rejected without following it"
        if index < len(rel.parts) - 1 and not stat.S_ISDIR(info.st_mode):
            return "not-directory", "source path component is not a directory"

    if info is None or not stat.S_ISREG(info.st_mode):
        return "not-file", "required marker is not a regular file"
    if info.st_size > MAX_MARKER_BYTES:
        return "oversized", "source marker exceeds the 1 MiB inspection limit"
    return "ok", "required public source marker present; file contents were not read"


def checkout_root(path: Path) -> tuple[Path | None, str, str]:
    candidate = path.expanduser()
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate

    current = Path(candidate.anchor)
    for part in candidate.parts[1:]:
        if part in ("", "."):
            continue
        if part == "..":
            current = current.parent
            continue
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            return None, "missing", "checkout directory not found"
        except OSError:
            return None, "unreadable", "checkout path component could not be inspected"
        if stat.S_ISLNK(info.st_mode):
            return None, "unsafe-symlink", "symlinked checkout path rejected"
        if not stat.S_ISDIR(info.st_mode):
            return None, "not-directory", "checkout path components must be directories"

    try:
        info = current.lstat()
    except FileNotFoundError:
        return None, "missing", "checkout directory not found"
    except OSError:
        return None, "unreadable", "checkout directory could not be inspected"
    if stat.S_ISLNK(info.st_mode):
        return None, "unsafe-symlink", "symlinked checkout path rejected"
    if not stat.S_ISDIR(info.st_mode):
        return None, "not-directory", "checkout root must be a directory"
    return current, "ok", "checkout root selected"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect an okf-agent-memory checkout without running its tools or changing files."
    )
    parser.add_argument("--json", action="store_true", help="emit one machine-readable JSON report")
    parser.add_argument("--repo", type=Path, help="existing upstream repository root to inspect")
    parser.add_argument("--expect-commit", help="full 40-hex commit SHA; requires --repo")
    return parser.parse_args()


def run(args: argparse.Namespace) -> tuple[dict[str, object], int]:
    if args.expect_commit is not None and (not args.repo or not SHA_RE.fullmatch(args.expect_commit)):
        return invalid_payload("--expect-commit requires --repo and a full 40-hex SHA"), 2

    checks: list[dict[str, object]] = []
    version = ".".join(str(part) for part in sys.version_info[:3])
    add(checks, "python", "ok" if sys.version_info >= (3, 11) else "mismatch",
        f"{version} ({sys.executable})", True)
    add(checks, "host", "ok", f"{platform.system()} {platform.machine()}")
    for tool in ("git", "go", "make", "okf"):
        path = shutil.which(tool)
        add(checks, f"tool:{tool}", "present" if path else "missing",
            "executable found on PATH; it was not run" if path else "executable not found on PATH",
            tool == "git" and args.repo is not None)

    repo = args.repo if args.repo else None
    if repo is None:
        add(checks, "repo", "missing", "provide --repo to inspect a pinned checkout", True)
    else:
        repo, repo_status, repo_details = checkout_root(repo)
        add(checks, "repo", repo_status, repo_details, True)

    if repo is not None:
        for marker in PUBLIC_MARKERS:
            status, details = source_marker(repo, marker)
            add(checks, f"structure:{marker}", status, details, True)

        head, error = git_head(repo)
        if head is None:
            add(checks, "git-head", "missing", error or "unable to read checkout HEAD", True)
        else:
            expected = args.expect_commit or EXPECTED_COMMIT
            matched = head.lower() == expected.lower()
            add(checks, "git-head", "ok" if matched else "mismatch",
                f"observed {head.lower()}; expected {expected.lower()}", True)

    failures = [item for item in checks if item["required"] and item["status"] not in PASSING]
    status = "blocked" if failures else "ok"
    payload: dict[str, object] = {
        "skill": SKILL,
        "scope": "offline-preflight",
        "status": status,
        "checks": checks,
        "runtime_verified": False,
    }
    if repo is not None:
        payload["repo"] = str(repo)
    return payload, 1 if failures else 0


def main() -> int:
    args = argparse.Namespace(json="--json" in sys.argv[1:], repo=None, expect_commit=None)
    try:
        args = parse_args()
        payload, code = run(args)
    except SystemExit as exc:
        if exc.code == 0:
            raise
        payload, code = invalid_payload("invalid command-line arguments"), 2
    except Exception as exc:  # Avoid leaking file contents, paths, or subprocess output.
        payload = {
            "skill": SKILL,
            "scope": "offline-preflight",
            "status": "error",
            "checks": [{"name": "preflight", "status": "error", "required": True,
                        "details": type(exc).__name__}],
            "runtime_verified": False,
        }
        code = 2

    # JSON is emitted in both modes so wrappers can always consume one stable report.
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
