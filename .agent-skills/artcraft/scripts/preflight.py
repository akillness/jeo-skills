#!/usr/bin/env python3
"""Offline ArtCraft host and source-checkout preflight."""
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

SKILL = "artcraft"
SCOPE = "offline-preflight"
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
MAX_MARKER_BYTES = 1_048_576
STRUCTURE = (
    "README.md",
    "LICENSE-MIT",
    "LICENSE-APACHE",
    "Cargo.toml",
    "_docs/dev_setup.md",
    "frontend/package.json",
    "crates/desktop/artcraft/tauri.conf.json",
)
TOOLS = (("vcs", "git"), ("rust", "cargo"), ("node", "node"), ("npm", "npm"))
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
        description="Inspect safe ArtCraft host facts and an optional local checkout; never run ArtCraft.",
        add_help=False,
        allow_abbrev=False,
    )
    value.add_argument("-h", "--help", action="store_true", help="show this help and exit")
    value.add_argument("--json", action="store_true", help="emit one JSON object")
    value.add_argument("--repo", metavar="PATH", help="optional local ArtCraft checkout")
    value.add_argument(
        "--expect-commit",
        metavar="FULL_SHA",
        help="expected 40-hex checkout commit (requires --repo)",
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
        "checks": checks,
        "runtime_verified": False,
    }


def emit(value: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(value, sort_keys=True))
        return
    print(f"{SKILL} offline preflight: {value['status']}")
    for item in value["checks"]:
        if item["status"] != "info":
            print(f"- {item['name']}: {item['detail']}")


def _symlink_component(path: Path) -> Path | None:
    """Return the first symlink in an absolute path, without following it."""
    candidate = Path(os.path.abspath(os.path.expanduser(str(path))))
    current = Path(candidate.anchor)
    for part in candidate.parts[1:]:
        current = current / part
        try:
            if stat.S_ISLNK(current.lstat().st_mode):
                return current
        except FileNotFoundError:
            return None
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
    if not repo.is_dir():
        checks.append(check("repo", "blocked", "supplied --repo is not a directory", path=str(repo)))
        return
    checks.append(check("repo", "ok", "supplied checkout directory exists", path=str(repo.resolve())))

    git_marker = repo / ".git"
    try:
        marker = git_marker.lstat()
    except FileNotFoundError:
        checks.append(check("repo_git", "blocked", "checkout has no .git marker", path=str(git_marker)))
    except OSError as exc:
        checks.append(check("repo_git", "blocked", f"could not inspect .git marker: {type(exc).__name__}", path=str(git_marker)))
    else:
        if stat.S_ISLNK(marker.st_mode):
            checks.append(check("repo_git", "blocked", ".git marker is a symlink", path=str(git_marker)))
        elif stat.S_ISDIR(marker.st_mode) or stat.S_ISREG(marker.st_mode):
            checks.append(check("repo_git", "ok", "checkout has a non-symlink .git marker", path=str(git_marker)))
        else:
            checks.append(check("repo_git", "blocked", ".git marker is not a directory or file", path=str(git_marker)))

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
    checks.append(check("host", "ok", "host facts observed without starting ArtCraft", os=os_name, arch=arch, release=platform.release() or "unknown"))
    py = sys.version_info
    py_text = f"{py.major}.{py.minor}.{py.micro}"
    py_ok = (py.major, py.minor) >= (3, 10)
    checks.append(check("python", "ok" if py_ok else "blocked", f"Python {py_text}; helper requires Python 3.10+", version=py_text, minimum="3.10"))
    for name, executable in TOOLS:
        path = shutil.which(executable)
        detail = f"{executable} executable discoverable; version unverified because it was not invoked" if path else f"{executable} executable not discoverable"
        checks.append(check(name, "ok" if path else "blocked", detail, path=path))
    supported = os_name in {"Darwin", "Linux", "Windows"}
    checks.append(check("platform", "ok" if supported else "info", "platform has documented ArtCraft source paths" if supported else "platform is outside the documented primary source paths; no readiness inferred", os=os_name))
    checks.append(check("data_boundary", "info", "preflight status does not assert release authenticity, account access, provider/model availability, scene readiness, generation success, build success, or export success; no upstream executable, installer, server, provider, download, network, secret, or config action was run"))
    if args.repo is not None:
        inspect_repo(args.repo, args.expect_commit, checks)

    blocked = any(item["status"] == "blocked" for item in checks)
    value = payload("blocked" if blocked else "ok", checks)
    emit(value, args.json)
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
