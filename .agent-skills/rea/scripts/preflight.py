#!/usr/bin/env python3
"""Offline, non-invasive REA host/source preflight."""
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

SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
PUBLIC_FILES = ("package.json", "README.md", "LICENSE", "scripts/rea.mjs")
OPTIONAL_TOOLS = ("ghidra", "ida", "jadx", "binwalk", "unblob")
def check(name: str, status: str, detail: str, **extra: Any) -> dict[str, Any]:
    item: dict[str, Any] = {"name": name, "status": status, "detail": detail}
    item.update(extra)
    return item
def tool_check(name: str, required: bool = True) -> dict[str, Any]:
    path = shutil.which(name)
    status = "ok" if path else ("blocked" if required else "info")
    detail = f"found at {path}; version not executed (unverified)" if path else "not found on PATH; execution not attempted"
    return check(f"tool.{name}", status, detail, path=path, version_verified=False)
def git_output(repo: Path, *args: str) -> tuple[str | None, str | None]:
    git_path = shutil.which("git")
    if not git_path:
        return None, "git not found on PATH"
    keep_env = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
    git_env = {key: os.environ[key] for key in keep_env if key in os.environ}
    git_env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    try:
        result = subprocess.run([git_path, "-C", str(repo), *args], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=3, check=False, env=git_env)
    except (OSError, subprocess.SubprocessError) as exc:
        return None, str(exc)
    if result.returncode != 0:
        return None, result.stderr.strip() or f"git exited {result.returncode}"
    return result.stdout.strip(), None
def source_checks(repo_arg: str, expected: str | None) -> list[dict[str, Any]]:
    repo = Path(repo_arg)
    if repo.is_symlink() or not repo.exists() or not repo.is_dir():
        return [check("repo.path", "blocked", "directory missing or symlinked; no source files read", path=repo_arg)]
    checks = [check("repo.path", "ok", "directory accepted; only named public structure checks are allowed", path=repo_arg)]
    for relative in PUBLIC_FILES:
        path = repo / relative
        if path.is_symlink():
            checks.append(check(f"repo.file.{relative}", "blocked", "symlink rejected; source file not read"))
        elif path.is_file():
            checks.append(check(f"repo.file.{relative}", "ok", "regular public structural file present"))
        else:
            checks.append(check(f"repo.file.{relative}", "blocked", "required public structural file missing"))
    package = repo / "package.json"
    if package.is_file() and not package.is_symlink():
        try:
            if package.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("package.json exceeds 2 MiB bound")
            data = json.loads(package.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("package.json root is not an object")
            name = data.get("name")
            bins = data.get("bin")
            if isinstance(bins, dict):
                bin_names = sorted(str(key) for key in bins)
            elif isinstance(bins, str):
                bin_names = ["default"]
            else:
                bin_names = []
            if not isinstance(name, str) or not name:
                checks.append(check("repo.package", "blocked", "package.json has no package name"))
            elif not bin_names:
                checks.append(check("repo.package", "blocked", f"package {name!r} has no CLI bin entry"))
            else:
                checks.append(check("repo.package", "ok", f"package {name!r} exposes CLI metadata", package_name=name, bin_names=bin_names))
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
            checks.append(check("repo.package", "blocked", f"package.json could not be safely inspected: {exc}"))
    git_root, git_error = git_output(repo, "rev-parse", "--show-toplevel")
    if git_error:
        checks.append(check("repo.git", "blocked", f"local git root unavailable: {git_error}"))
        return checks
    if git_root is None or Path(git_root).resolve() != repo.resolve():
        checks.append(check("repo.git", "blocked", "Git show-toplevel differs from caller repo", observed=git_root, expected=str(repo.resolve())))
        return checks
    head, head_error = git_output(repo, "rev-parse", "HEAD")
    if head_error or not head:
        checks.append(check("repo.commit", "blocked", f"local HEAD unavailable: {head_error or 'empty result'}"))
    else:
        checks.append(check("repo.commit", "ok", "local HEAD read; no network or write performed", commit=head, git_root=git_root))
        if expected is not None:
            status = "ok" if SHA_RE.fullmatch(head) and head.lower() == expected.lower() else "blocked"
            detail = "HEAD matches caller-supplied expected commit" if status == "ok" else "HEAD is not a full SHA or differs from caller-supplied expected commit"
            checks.append(check("repo.expected_commit", status, detail, expected=expected, observed=head))
    return checks

def build_result(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    checks: list[dict[str, Any]] = [
        check("host.platform", "ok", f"{platform.system()} {platform.machine()}; host inspection only"),
        check("host.python", "ok" if sys.version_info >= (3, 10) else "blocked", f"Python {platform.python_version()}"),
        tool_check("node"),
        tool_check("npm"),
        tool_check("rea", required=False),
        tool_check("rea-agents", required=False),
    ]
    rea_found = any(item["name"] in {"tool.rea", "tool.rea-agents"} and item["status"] == "ok" for item in checks)
    if rea_found:
        checks.append(check("rea.path", "ok", "rea or rea-agents path available; executable not invoked"))
    else:
        checks.append(check("rea.path", "blocked", "neither rea nor rea-agents found on PATH; executable not invoked"))
    for name in OPTIONAL_TOOLS:
        checks.append(tool_check(name, required=False))
    if args.repo is not None:
        checks.extend(source_checks(args.repo, args.expect_commit))

    blocked = any(item["status"] == "blocked" for item in checks)
    result = {
        "skill": "rea",
        "scope": "offline-preflight",
        "status": "blocked" if blocked else "ok",
        "checks": checks,
        "runtime_verified": False,
    }
    return result, 1 if blocked else 0
def main() -> int:
    parser = argparse.ArgumentParser(description="Check REA host paths and optional pinned source shape without running REA.")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", metavar="PATH", help="optional local REA source directory")
    parser.add_argument("--expect-commit", metavar="FULL_SHA", help="expected 40-hex commit; requires --repo")
    try:
        args = parser.parse_args()
    except SystemExit as exc:
        if exc.code == 0:
            raise
        if "--json" in sys.argv[1:]:
            print(json.dumps({"skill": "rea", "scope": "offline-preflight", "status": "error", "checks": [check("input", "error", "invalid command-line arguments")], "runtime_verified": False}, sort_keys=True))
        else:
            print("rea offline preflight: ERROR invalid command-line arguments")
        return int(exc.code)
    if args.expect_commit is not None and args.repo is None:
        result = {"skill": "rea", "scope": "offline-preflight", "status": "error", "checks": [check("input", "error", "--expect-commit requires --repo")], "runtime_verified": False}
        print(json.dumps(result, sort_keys=True) if args.json else "rea offline preflight: ERROR --expect-commit requires --repo")
        return 2
    if args.expect_commit is not None and not SHA_RE.fullmatch(args.expect_commit):
        result = {"skill": "rea", "scope": "offline-preflight", "status": "error", "checks": [check("input", "error", "--expect-commit must be a full 40-hex SHA")], "runtime_verified": False}
        print(json.dumps(result, sort_keys=True) if args.json else "rea offline preflight: ERROR invalid --expect-commit")
        return 2
    try:
        result, code = build_result(args)
    except Exception as exc:  # Keep JSON callers on the documented schema.
        result, code = ({"skill": "rea", "scope": "offline-preflight", "status": "error", "checks": [check("runtime", "error", f"preflight failed: {exc}")], "runtime_verified": False}, 2)
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"rea offline preflight: {result['status'].upper()}")
        for item in result["checks"]:
            print(f"- {item['name']}: {item['status']} — {item['detail']}")
    return code
if __name__ == "__main__":
    raise SystemExit(main())
