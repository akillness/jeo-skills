#!/usr/bin/env python3
"""Offline, read-only diagram-design source and host preflight."""
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

SKILL = "diagram-design"
EXPECTED_SHA = re.compile(r"[0-9a-fA-F]{40}\Z")
MAX_MARKER_BYTES = 1024 * 1024
STRUCTURE = (
    ("README.md", "file"),
    ("LICENSE", "file"),
    ("skills/diagram-design/SKILL.md", "file"),
    ("skills/diagram-design/assets/template.html", "file"),
    ("skills/diagram-design/references/style-guide.md", "file"),
    ("skills/diagram-design/scripts/self_check.py", "file"),
)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="preflight.py",
        description="Inspect safe host facts and an optional local diagram-design checkout; never run upstream tools.",
        add_help=False,
        exit_on_error=False,
    )
    p.add_argument("-h", "--help", action="store_true", help="show this help and exit")
    p.add_argument("--json", action="store_true", help="emit one JSON object")
    p.add_argument("--repo", metavar="PATH", help="optional local diagram-design checkout")
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




def marker_check(repo: Path, relative: str, kind: str) -> dict[str, Any]:
    path = repo / relative
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        return check(f"repo.structure:{relative}", "blocked", f"{kind} missing", path=str(path))
    except OSError as exc:
        return check(f"repo.structure:{relative}", "blocked", f"cannot inspect marker: {exc}", path=str(path))
    if stat.S_ISLNK(info.st_mode):
        return check(
            f"repo.structure:{relative}",
            "blocked",
            "marker is a symlink; source metadata is not trusted",
            path=str(path),
        )
    if kind == "file" and not stat.S_ISREG(info.st_mode):
        return check(f"repo.structure:{relative}", "blocked", "marker is not a regular file", path=str(path))
    if kind == "dir" and not stat.S_ISDIR(info.st_mode):
        return check(f"repo.structure:{relative}", "blocked", "marker is not a directory", path=str(path))
    if kind == "file" and info.st_size > MAX_MARKER_BYTES:
        return check(
            f"repo.structure:{relative}",
            "blocked",
            f"marker is oversized ({info.st_size} bytes; limit {MAX_MARKER_BYTES})",
            path=str(path),
            size=info.st_size,
        )
    return check(
        f"repo.structure:{relative}",
        "ok",
        f"{kind} present; metadata was checked without reading contents",
        path=str(path),
        size=info.st_size if kind == "file" else None,
    )


def inspect_repo(repo_arg: str, expected: str | None, checks: list[dict[str, Any]]) -> None:
    repo_input = Path(repo_arg)
    try:
        repo_absolute = Path(os.path.abspath(os.fspath(repo_input)))
        supplied_stat = os.lstat(repo_absolute)
    except FileNotFoundError:
        checks.append(check("repo", "blocked", "supplied --repo does not exist", path=str(repo_input)))
        return
    except OSError as exc:
        checks.append(check("repo", "blocked", f"cannot inspect supplied --repo: {exc}", path=str(repo_input)))
        return
    if stat.S_ISLNK(supplied_stat.st_mode):
        checks.append(check("repo", "blocked", "supplied --repo path is a symlink", path=str(repo_input)))
        return
    if not stat.S_ISDIR(supplied_stat.st_mode):
        checks.append(check("repo", "blocked", "supplied --repo is not a directory", path=str(repo_input)))
        return
    repo = repo_absolute
    checks.append(check("repo", "ok", "supplied checkout directory exists and is not a symlink", path=str(repo)))

    git_marker = repo / ".git"
    git_marker_safe = True
    try:
        git_info = os.lstat(git_marker)
    except FileNotFoundError:
        git_marker_safe = False
        checks.append(check("repo_git", "blocked", "checkout has no .git marker", path=str(git_marker)))
    except OSError as exc:
        git_marker_safe = False
        checks.append(check("repo_git", "blocked", f"cannot inspect .git marker: {exc}", path=str(git_marker)))
    else:
        if stat.S_ISLNK(git_info.st_mode):
            git_marker_safe = False
            checks.append(check("repo_git", "blocked", ".git marker is a symlink", path=str(git_marker)))
        else:
            checks.append(check("repo_git", "ok", "checkout has a non-symlink .git marker", path=str(git_marker)))

    for relative, kind in STRUCTURE:
        checks.append(marker_check(repo, relative, kind))

    if not git_marker_safe:
        checks.append(check("repo_commit", "blocked", "VCS inspection skipped because the .git marker is unsafe"))
        return


    git_bin = shutil.which("git")
    if git_bin is None:
        checks.append(check("vcs_tool", "blocked", "Git is unavailable; checkout commit cannot be inspected"))
        return
    # Do not forward credentials, trace selectors, repository overrides, or config paths.
    allowed_keys = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
    git_env = {key: os.environ[key] for key in allowed_keys if key in os.environ}
    git_env.update(
        {
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_ALLOW_PROTOCOL": "",
        }
    )
    try:
        proc = subprocess.run(
            [git_bin, "-C", str(repo), "rev-parse", "--show-toplevel", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
            env=git_env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        checks.append(check("repo_commit", "blocked", f"bounded VCS inspection failed: {exc}"))
        return
    lines = proc.stdout.splitlines()
    if proc.returncode != 0 or len(lines) != 2:
        checks.append(check("repo_commit", "blocked", "bounded VCS inspection did not return root and full commit"))
        return
    observed_root, observed = lines
    try:
        root_matches = Path(observed_root).resolve() == repo.resolve()
    except OSError:
        root_matches = False
    if not root_matches:
        checks.append(
            check(
                "repo_root",
                "blocked",
                "VCS show-toplevel does not match supplied checkout",
                observed=observed_root,
                expected=str(repo.resolve()),
            )
        )
        return
    if not EXPECTED_SHA.fullmatch(observed):
        checks.append(check("repo_commit", "blocked", "VCS inspection did not return a full commit", observed=observed))
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


def emit(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, sort_keys=True))
        return
    print(f"diagram-design offline preflight: {payload['status']}")
    for item in payload["checks"]:
        if item["status"] != "info":
            print(f"- {item['name']}: {item['detail']}")


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    wants_json = "--json" in raw
    args, error = parse(raw)
    if args is None and error is None:
        return 0
    if error is not None:
        emit(result("error", [check("input", "blocked", error)]), wants_json)
        return 2
    assert args is not None
    if args.expect_commit is not None and args.repo is None:
        emit(result("error", [check("input", "blocked", "--expect-commit requires --repo")]), args.json)
        return 2
    if args.expect_commit is not None and not EXPECTED_SHA.fullmatch(args.expect_commit):
        emit(
            result("error", [check("input", "blocked", "--expect-commit must be exactly 40 hexadecimal characters")]),
            args.json,
        )
        return 2

    checks: list[dict[str, Any]] = []
    os_name = platform.system() or "unknown"
    arch = platform.machine() or "unknown"
    checks.append(check("host", "ok", "host facts observed without running upstream code", os=os_name, arch=arch))
    py = sys.version_info
    py_text = f"{py.major}.{py.minor}.{py.micro}"
    py_ok = (py.major, py.minor) >= (3, 10)
    checks.append(check("python_runtime", "ok" if py_ok else "blocked", f"Python {py_text}; helper requires Python 3.10+", version=py_text, minimum="3.10"))
    vcs_path = shutil.which("git")
    checks.append(
        check(
            "vcs_tool",
            "ok" if vcs_path else "blocked",
            "Git discoverable for pinned source inspection; never invoked without --repo" if vcs_path else "Git not discoverable; pinned source inspection is unavailable",
            path=vcs_path,
        )
    )
    checks.append(
        check(
            "runtime_boundary",
            "info",
            "preflight does not assert diagram rendering, browser availability, font loading, export success, or network access; no upstream command, server, browser, package, credential, model, or network action was run",
        )
    )
    if args.repo is not None:
        inspect_repo(args.repo, args.expect_commit, checks)

    blocked = any(item["status"] == "blocked" for item in checks)
    payload = result("blocked" if blocked else "ok", checks)
    emit(payload, args.json)
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
