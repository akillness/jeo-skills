#!/usr/bin/env python3
"""Offline, read-only VoiceStudio host and checkout preflight."""
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

SKILL = "voicestudio"
EXPECTED_SHA = re.compile(r"[0-9a-fA-F]{40}\Z")
# All entries are regular files tracked at the pinned upstream commit.
STRUCTURE = (
    ("README.md", "file"),
    ("LICENSE", "file"),
    ("pyproject.toml", "file"),
    ("package.json", "file"),
    ("config/app.json", "file"),
    ("backend/config/models.yaml", "file"),
)
REQUIRED_TOOLS = ("python3", "git", "ffmpeg", "node", "bun")
MAX_MARKER_BYTES = 16 * 1024 * 1024


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="preflight.py",
        description="Inspect safe host facts and an optional local VoiceStudio checkout; never run VoiceStudio.",
        add_help=False,
        exit_on_error=False,
    )
    p.add_argument("-h", "--help", action="store_true", help="show this help and exit")
    p.add_argument("--json", action="store_true", help="emit one JSON object")
    p.add_argument("--repo", metavar="PATH", help="optional local VoiceStudio checkout")
    p.add_argument("--expect-commit", metavar="FULL_SHA", help="expected 40-hex checkout commit (requires --repo)")
    return p


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
    p = parser()
    if "--help" in argv or "-h" in argv:
        p.print_help()
        return None, None
    try:
        return p.parse_args(argv), None
    except (argparse.ArgumentError, SystemExit) as exc:
        return None, str(exc) or "invalid arguments"


def _safe_marker(path: Path, repo: Path) -> tuple[str, str]:
    """Check a marker with lstat only; never read marker contents."""
    try:
        info = path.lstat()
    except FileNotFoundError:
        return "blocked", "file missing"
    except OSError as exc:
        return "blocked", f"marker lstat failed: {exc}"
    if stat.S_ISLNK(info.st_mode):
        return "unsafe-symlink", "marker is a symlink"
    if not stat.S_ISREG(info.st_mode):
        return "blocked", "marker is not a regular file"
    if info.st_size > MAX_MARKER_BYTES:
        return "blocked", f"marker exceeds bounded size of {MAX_MARKER_BYTES} bytes"
    return "ok", "regular marker present; contents not read"


def inspect_repo(repo_arg: str, expected: str | None, checks: list[dict[str, Any]]) -> None:
    repo = Path(repo_arg)
    try:
        repo_stat = repo.lstat()
    except FileNotFoundError:
        checks.append(check("repo", "blocked", "supplied --repo does not exist", path=str(repo)))
        return
    except OSError as exc:
        checks.append(check("repo", "blocked", f"supplied --repo cannot be inspected: {exc}", path=str(repo)))
        return
    if stat.S_ISLNK(repo_stat.st_mode):
        checks.append(check("repo", "mismatch", "supplied --repo is a symlink", path=str(repo)))
        return
    if not stat.S_ISDIR(repo_stat.st_mode):
        checks.append(check("repo", "blocked", "supplied --repo is not a directory", path=str(repo)))
        return
    checks.append(check("repo", "ok", "supplied checkout directory exists", path=str(repo)))


    git_marker = repo / ".git"
    try:
        git_info = git_marker.lstat()
        git_safe = not stat.S_ISLNK(git_info.st_mode)
    except FileNotFoundError:
        git_info = None
        git_safe = False
    except OSError:
        git_info = None
        git_safe = False
    if git_info is None:
        checks.append(check("repo_git", "blocked", "checkout has no .git marker", path=str(git_marker)))
    elif not git_safe:
        checks.append(check("repo_git", "unsafe-symlink", "checkout .git marker is a symlink", path=str(git_marker)))
    else:
        checks.append(check("repo_git", "ok", "checkout has a non-symlink .git marker", path=str(git_marker)))

    for relative, kind in STRUCTURE:
        path = repo / relative
        status, detail = _safe_marker(path, repo)
        if status == "ok" and kind != "file":
            status, detail = "blocked", "unexpected marker kind"
        checks.append(check(f"repo_shape:{relative}", status, detail, path=str(path)))

    git_bin = shutil.which("git")
    if git_bin is None:
        checks.append(check("repo_commit", "blocked", "version-control executable is unavailable; commit cannot be inspected"))
        return
    if git_info is None or not git_safe:
        checks.append(check("repo_commit", "blocked", "commit inspection skipped because the checkout marker is unsafe"))
        return
    git_env = {
        key: os.environ[key]
        for key in ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
        if key in os.environ
    }
    try:
        proc = subprocess.run(
            [git_bin, "-C", str(repo), "rev-parse", "--show-toplevel", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
            env={
                **git_env,
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_OPTIONAL_LOCKS": "0",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_ALLOW_PROTOCOL": "",
            },
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        checks.append(check("repo_commit", "blocked", f"bounded commit inspection failed: {exc}"))
        return
    lines = proc.stdout.splitlines()
    if proc.returncode != 0 or len(lines) != 2:
        checks.append(check("repo_commit", "blocked", "bounded commit inspection did not return root and full commit", observed=proc.stdout.strip()))
        return
    observed_root, observed = lines
    try:
        root_matches = Path(observed_root).resolve() == repo.resolve()
    except OSError:
        root_matches = False
    if not root_matches:
        checks.append(check("repo_root", "blocked", "version-control root does not match supplied checkout", observed=observed_root, expected=str(repo.resolve())))
        return
    if not EXPECTED_SHA.fullmatch(observed):
        checks.append(check("repo_commit", "blocked", "commit inspection did not return a full 40-hex commit", observed=observed))
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
            print(f"VoiceStudio offline preflight: error\n- input: {error}")
        return 2
    assert args is not None
    if args.expect_commit is not None and args.repo is None:
        payload = result("error", [check("input", "blocked", "--expect-commit requires --repo")])
        if args.json:
            print(json.dumps(payload, sort_keys=True))
        else:
            print("VoiceStudio offline preflight: error\n- input: --expect-commit requires --repo")
        return 2
    if args.expect_commit is not None and not EXPECTED_SHA.fullmatch(args.expect_commit):
        payload = result("error", [check("input", "blocked", "--expect-commit must be exactly 40 hexadecimal characters")])
        if args.json:
            print(json.dumps(payload, sort_keys=True))
        else:
            print("VoiceStudio offline preflight: error\n- input: --expect-commit must be exactly 40 hexadecimal characters")
        return 2

    checks: list[dict[str, Any]] = []
    os_name = platform.system() or "unknown"
    arch = platform.machine() or "unknown"
    checks.append(check("host", "ok", "host facts observed without starting VoiceStudio", os=os_name, arch=arch, release=platform.release() or "unknown"))
    py = sys.version_info
    py_text = f"{py.major}.{py.minor}.{py.micro}"
    py_ok = (py.major, py.minor) >= (3, 10)
    checks.append(check("python_runtime", "ok" if py_ok else "blocked", f"Python {py_text}; helper requires Python 3.10+", version=py_text, minimum="3.10"))
    for index, tool in enumerate(REQUIRED_TOOLS, start=1):
        path = shutil.which(tool)
        checks.append(check(f"tool:{index}", "ok" if path else "blocked", f"{tool} discoverable; version unverified because it was not invoked" if path else f"{tool} executable not discoverable", tool=tool, path=path))
    supported = os_name in {"Darwin", "Linux", "Windows"}
    checks.append(check("platform", "ok" if supported else "info", "platform has documented VoiceStudio host rules" if supported else "platform is not a documented primary host family; no readiness inferred", os=os_name))
    checks.append(check("boundary", "info", "preflight status only reflects offline checks; no VoiceStudio command, server, benchmark, provider, model download, credential, or network action was run, so runtime and audio quality remain unverified"))
    if args.repo is not None:
        inspect_repo(args.repo, args.expect_commit, checks)

    blocked = any(item["status"] in {"blocked", "unsafe-symlink", "mismatch"} for item in checks)
    overall = "blocked" if blocked else "ok"
    payload = result(overall, checks)
    if args.json:
        print(json.dumps(payload, sort_keys=True))
    else:
        print(f"VoiceStudio offline preflight: {overall}")
        for item in checks:
            if item["status"] not in {"info"}:
                print(f"- {item['name']}: {item['detail']}")
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
