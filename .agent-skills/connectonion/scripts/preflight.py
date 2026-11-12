#!/usr/bin/env python3
"""Offline ConnectOnion (`co`) host and source-checkout preflight."""
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
from typing import Any

SKILL = "connectonion"
SCOPE = "offline-preflight"
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
MAX_MARKER_BYTES = 1_048_576

STRUCTURE = (
    "README.md",
    "LICENSE",
    "pyproject.toml",
    "install.sh",
    "connectonion/__init__.py",
    "connectonion/_version.py",
    "connectonion/cli/__init__.py",
)

# `co` must already be installed, or one documented install route must exist.
# uv brings its own Python; pip needs Python 3.11+ (checked separately).
INSTALL_ROUTE_TOOLS = ("co", "uv", "pip", "pip3")

OPTIONAL_TOOLS = (
    ("cli", "co", "ConnectOnion `co` command"),
    ("installer_uv", "uv", "uv, used by the upstream install.sh"),
    ("installer_pip", "pip", "pip, the documented alternative install path"),
    ("agent_codex", "codex", "Codex CLI, used by `co init` and REM upkeep"),
    ("agent_claude", "claude", "Claude Code CLI, REM fallback and `co claude`"),
    ("vcs", "git", "git, needed only to verify a source checkout commit"),
)

# Directories that `co init` creates or edits. Only their existence is
# reported; their contents are never read (they hold keys and credentials).
STATE_PATHS = (
    ("state_co_home", "~/.co", "ConnectOnion identity, keys and REM notebook"),
    ("state_codex_home", "~/.codex", "Codex config that `co init` may edit"),
    ("state_claude_home", "~/.claude", "Claude Code config that `co init` may edit"),
)

HOST_ENV_KEYS = (
    "PATH",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
)


class InputError(ValueError):
    """Raised for invalid command-line input without printing a traceback."""


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)


def parser() -> argparse.ArgumentParser:
    value = Parser(
        prog="preflight.py",
        description="Inspect local host and source-checkout prerequisites for ConnectOnion (`co`).",
    )
    value.add_argument(
        "--json",
        action="store_true",
        help="Emit preflight results as structured JSON.",
    )
    value.add_argument(
        "--repo",
        type=str,
        default=None,
        help="Path to an existing, non-symlinked connectonion source checkout.",
    )
    value.add_argument(
        "--expect-commit",
        type=str,
        default=None,
        help="Expected 40-character hexadecimal git commit SHA (requires --repo).",
    )
    return value


def check(name: str, status: str, detail: str, **extra: Any) -> dict[str, Any]:
    item: dict[str, Any] = {"name": name, "status": status, "detail": detail}
    item.update(extra)
    return item


def payload(status: str, checks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "skill": SKILL,
        "scope": SCOPE,
        "status": status,
        "runtime_verified": False,
        "checks": checks,
    }


def emit(value: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(value, indent=2))
    else:
        print(f"[{value['status'].upper()}] {value['skill']} ({value['scope']})")
        for item in value.get("checks", []):
            print(f"- {item['name']}: {item['detail']}")


def _symlink_component(path: Path) -> Path | None:
    """Return the first symlink in an absolute path, without following it."""
    candidate = path.resolve() if not path.is_absolute() else path
    current = Path(candidate.parts[0])
    for part in candidate.parts[1:]:
        current = current / part
        try:
            target = current.lstat()
            if stat.S_ISLNK(target.st_mode):
                return current
        except OSError:
            return current
    return None


def _safe_marker(repo: Path, relative: str, checks: list[dict[str, Any]]) -> None:
    current = repo
    parts = PurePosixPath(relative).parts
    for part in parts[:-1]:
        current = current / part
        try:
            marker = current.lstat()
        except FileNotFoundError:
            checks.append(check(f"repo.file:{relative}", "blocked", "required public source marker is missing", path=str(repo / relative)))
            return
        except OSError as exc:
            checks.append(check(f"repo.file:{relative}", "blocked", f"could not inspect source marker: {type(exc).__name__}", path=str(repo / relative)))
            return
        if stat.S_ISLNK(marker.st_mode):
            checks.append(check(f"repo.file:{relative}", "blocked", "source marker path component is a symlink", path=str(repo / relative)))
            return
        if not stat.S_ISDIR(marker.st_mode):
            checks.append(check(f"repo.file:{relative}", "blocked", "source marker parent is not a directory", path=str(repo / relative)))
            return

    path = current / parts[-1]
    try:
        marker = path.lstat()
    except FileNotFoundError:
        checks.append(check(f"repo.file:{relative}", "blocked", "required public source marker is missing", path=str(path)))
        return
    except OSError as exc:
        checks.append(check(f"repo.file:{relative}", "blocked", f"could not inspect source marker: {type(exc).__name__}", path=str(path)))
        return
    if stat.S_ISLNK(marker.st_mode):
        checks.append(check(f"repo.file:{relative}", "blocked", "source marker is a symlink", path=str(path)))
    elif not stat.S_ISREG(marker.st_mode):
        checks.append(check(f"repo.file:{relative}", "blocked", "source marker is not a regular file", path=str(path)))
    elif marker.st_size > MAX_MARKER_BYTES:
        checks.append(check(f"repo.file:{relative}", "blocked", f"source marker exceeds {MAX_MARKER_BYTES} bytes", path=str(path), size=marker.st_size))
    else:
        checks.append(check(f"repo.file:{relative}", "ok", "required public source marker is present; contents were not read", path=str(path), size=marker.st_size))


def _approved_git_environment() -> dict[str, str]:
    environment = {key: os.environ[key] for key in HOST_ENV_KEYS if key in os.environ}
    environment.update(
        {
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_ALLOW_PROTOCOL": "",
        }
    )
    return environment


def _inspect_commit(repo: Path, expected: str | None, checks: list[dict[str, Any]]) -> None:
    git_bin = shutil.which("git")
    if git_bin is None:
        checks.append(check("repo_commit", "blocked", "git is unavailable; checkout commit cannot be inspected"))
        return
    try:
        process = subprocess.run(
            [git_bin, "-C", str(repo), "rev-parse", "--show-toplevel", "HEAD"],
            capture_output=True,
            text=True,
            errors="replace",
            check=False,
            timeout=5,
            env=_approved_git_environment(),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        checks.append(check("repo_commit", "blocked", f"bounded git inspection failed: {type(exc).__name__}"))
        return
    lines = process.stdout.splitlines()
    if process.returncode != 0 or len(lines) != 2:
        checks.append(check("repo_commit", "blocked", "bounded git inspection did not return checkout root and full commit"))
        return
    observed_root, observed = lines
    try:
        root_matches = Path(observed_root).resolve() == repo.resolve()
    except OSError:
        root_matches = False
    if not root_matches:
        checks.append(check("repo_root", "blocked", "git show-toplevel does not match supplied checkout", expected=str(repo.resolve())))
        return
    if not SHA_RE.fullmatch(observed):
        checks.append(check("repo_commit", "blocked", "bounded git inspection did not return a full commit"))
        return
    if expected is None:
        checks.append(check("repo_commit", "ok", "observed checkout commit; no comparison requested", observed=observed))
    else:
        matches = observed.lower() == expected.lower()
        checks.append(
            check(
                "repo_commit",
                "ok" if matches else "blocked",
                "checkout commit matches --expect-commit" if matches else "checkout commit mismatches --expect-commit",
                observed=observed,
                expected=expected,
            )
        )


def inspect_repo(repo_arg: str, expected: str | None, checks: list[dict[str, Any]]) -> None:
    repo = Path(repo_arg).expanduser()
    symlink = _symlink_component(repo)
    if symlink is not None:
        checks.append(check("repo", "blocked", "supplied --repo path contains a symlink component", path=str(symlink)))
        return
    try:
        resolved = repo.resolve()
        status = resolved.stat()
    except FileNotFoundError:
        checks.append(check("repo", "blocked", "supplied --repo directory does not exist", path=str(repo)))
        return
    except OSError as exc:
        checks.append(check("repo", "blocked", f"could not inspect --repo directory: {type(exc).__name__}", path=str(repo)))
        return
    if not stat.S_ISDIR(status.st_mode):
        checks.append(check("repo", "blocked", "supplied --repo is not a directory", path=str(repo)))
        return
    checks.append(check("repo", "ok", "supplied --repo is a directory without symlinks", path=str(repo)))
    for relative in STRUCTURE:
        _safe_marker(repo, relative, checks)
    _inspect_commit(repo, expected, checks)


def parse(raw: list[str]) -> tuple[argparse.Namespace | None, str | None]:
    if "--help" in raw or "-h" in raw:
        parser().print_help()
        return None, None
    try:
        return parser().parse_args(raw), None
    except (InputError, SystemExit) as exc:
        return None, str(exc) or "invalid arguments"


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    wants_json = "--json" in raw
    args, error = parse(raw)
    if args is None and error is None:
        return 0
    if error is not None:
        value = payload("error", [check("input", "blocked", error)])
        emit(value, wants_json)
        return 2
    assert args is not None
    if args.expect_commit is not None and args.repo is None:
        value = payload("error", [check("input", "blocked", "--expect-commit requires --repo")])
        emit(value, args.json)
        return 2
    if args.expect_commit is not None and not SHA_RE.fullmatch(args.expect_commit):
        value = payload("error", [check("input", "blocked", "--expect-commit must be exactly 40 hexadecimal characters")])
        emit(value, args.json)
        return 2

    checks: list[dict[str, Any]] = []
    os_name = platform.system() or "unknown"
    arch = platform.machine() or "unknown"
    checks.append(
        check(
            "host",
            "ok",
            "host facts observed without executing co",
            os=os_name,
            arch=arch,
            release=platform.release() or "unknown",
        )
    )
    py = sys.version_info
    py_text = f"{py.major}.{py.minor}.{py.micro}"
    py_ok = (py.major, py.minor) >= (3, 10)
    co_py_ok = (py.major, py.minor) >= (3, 11)
    checks.append(
        check(
            "python",
            "ok" if py_ok else "blocked",
            f"Python {py_text}; helper requires Python 3.10+",
            version=py_text,
            minimum="3.10",
        )
    )
    checks.append(
        check(
            "python_for_pip_install",
            "ok" if co_py_ok else "info",
            "this interpreter satisfies connectonion's Python 3.11+ requirement for a pip install"
            if co_py_ok
            else "this interpreter is below Python 3.11; use the uv-based installer or a newer Python for `pip install connectonion`",
            version=py_text,
            minimum="3.11",
            optional=True,
        )
    )

    route = next((t for t in INSTALL_ROUTE_TOOLS if shutil.which(t)), None)
    checks.append(
        check(
            "install_route",
            "ok" if route else "blocked",
            f"{route} discoverable; `co` is installed or an install route exists (version unverified, not invoked)"
            if route
            else "none of co, uv, pip, pip3 is discoverable on PATH; ConnectOnion cannot be installed or used from this host",
            path=shutil.which(route) if route else None,
        )
    )

    for name, executable, label in OPTIONAL_TOOLS:
        path = shutil.which(executable)
        detail = (
            f"{executable} ({label}) discoverable; version unverified because it was not invoked"
            if path
            else f"{executable} ({label}) not discoverable on PATH"
        )
        checks.append(check(name, "ok" if path else "info", detail, path=path, optional=True))

    for name, raw_path, label in STATE_PATHS:
        expanded = Path(raw_path).expanduser()
        try:
            present = expanded.is_dir()
        except OSError:
            present = False
        checks.append(
            check(
                name,
                "info",
                f"{raw_path} ({label}) {'exists' if present else 'is absent'}; contents were not read",
                path=str(expanded),
                present=present,
                optional=True,
            )
        )

    supported = os_name in {"Darwin", "Linux", "Windows"}
    checks.append(
        check(
            "platform",
            "ok" if supported else "info",
            "platform has documented ConnectOnion support (macOS, Linux, Windows)"
            if supported
            else "platform is outside the primary documented tier; readiness unverified",
            os=os_name,
        )
    )
    checks.append(
        check(
            "data_boundary",
            "info",
            "preflight status does not assert binary authenticity, account access, provider readiness, "
            "connected-account state, credit balance, or scheduler state; no unverified executable, installer, server, "
            "download, network request, credential, or config write was performed",
        )
    )

    if args.repo is not None:
        inspect_repo(args.repo, args.expect_commit, checks)

    blocked = any(item["status"] == "blocked" for item in checks)
    value = payload("blocked" if blocked else "ok", checks)
    emit(value, args.json)
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
