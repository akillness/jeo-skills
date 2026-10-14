#!/usr/bin/env python3
"""Offline prerequisite and checkout-shape audit for Zurp."""
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
REQUIRED_FILES = (
    "README.md",
    "build.gradle.kts",
    "bug-bounty-research/README.md",
    "bug-bounty-research/package.json",
    "bug-bounty-research/.mcp.json",
)
REQUIRED_DIRS = (
    "bug-bounty-research",
    "bug-bounty-research/src",
    "bug-bounty-research/skills",
)
class ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ValueError(message)
def result(name: str, status: str, detail: str) -> dict[str, str]:
    return {"name": name, "status": status, "detail": detail}
def host_checks() -> list[dict[str, str]]:
    system = platform.system() or "unknown"
    arch = platform.machine() or "unknown"
    if system in {"Darwin", "Linux"}:
        os_status = "ok"
        os_detail = f"{system}/{arch}; documented host platform"
    elif system == "Windows":
        os_status = "ok"
        os_detail = f"{system}/{arch}; upstream expects path differences"
    else:
        os_status = "blocked"
        os_detail = f"{system}/{arch}; upstream documents macOS/Linux"
    py = sys.version_info
    py_text = f"{py.major}.{py.minor}.{py.micro}"
    py_status = "ok" if (py.major, py.minor) >= (3, 10) else "blocked"
    return [
        result("host", os_status, os_detail),
        result("python", py_status, f"{py_text}; helper requires Python 3.10+")
    ]
def tool_checks(surface: str) -> list[dict[str, str]]:
    requirements = {
        "java": "Java 17+ source build prerequisite; version unverified",
        "gradle": "Gradle Jar build prerequisite; version unverified",
        "node": "Node 22.19.0+ MCP prerequisite; version unverified",
        "npm": "npm MCP package prerequisite; version unverified",
    }
    tools = tuple(requirements) if surface == "all" else ("java", "gradle") if surface == "burp" else ("node", "npm")
    checks = [result("surface", "ok", f"{surface} toolchain selected")]
    for tool in tools:
        path = shutil.which(tool)
        checks.append(result(tool, "ok" if path else "blocked",
                             f"found at {path}; {requirements[tool]}" if path
                             else f"not found; {requirements[tool]}"))
    return checks
def shape_check(path: Path, relative: str, kind: str) -> dict[str, str]:
    try:
        present = path.is_dir() if kind == "directory" else path.is_file()
    except (OSError, ValueError) as exc:
        return result(f"shape:{relative}", "error", f"{kind} check failed: {exc}")
    state = "ok" if present else "blocked"
    return result(f"shape:{relative}", state, f"{kind} present" if present else f"{kind} missing")
def repo_checks(repo_arg: str, expected: str | None) -> list[dict[str, str]]:
    try:
        repo = Path(repo_arg)
        if not repo.exists() or not repo.is_dir():
            return [result("repo", "blocked", "--repo is not an existing directory")]
    except (OSError, ValueError) as exc:
        return [result("repo", "error", f"cannot inspect --repo: {exc}")]
    checks = []
    for relative in REQUIRED_DIRS:
        checks.append(shape_check(repo / relative, relative, "directory"))
    for relative in REQUIRED_FILES:
        checks.append(shape_check(repo / relative, relative, "file"))
    git = shutil.which("git")
    if not git:
        checks.append(result("git", "blocked", "git is required to inspect the local revision"))
        return checks
    git_env = {key: os.environ[key] for key in ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR") if key in os.environ}
    git_env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    def run_git(*arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run([git, "-C", str(repo), *arguments], env=git_env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3, check=False)
    try:
        top = run_git("rev-parse", "--show-toplevel")
        if top.returncode != 0:
            checks.append(result("git-toplevel", "blocked", "Git could not resolve the checkout root"))
            return checks
        shown = top.stdout.strip()
        if not shown or Path(shown).resolve(strict=True) != repo.resolve(strict=True):
            checks.append(result("git-toplevel", "blocked", "Git checkout root differs from --repo"))
            return checks
        proc = run_git("rev-parse", "--verify", "HEAD")
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        checks.append(result("git-revision", "error", f"local rev-parse failed: {exc}"))
        return checks
    if proc.returncode != 0:
        checks.append(result("git-revision", "blocked", "checkout has no readable HEAD revision"))
        return checks
    observed = proc.stdout.strip()
    if expected and observed.lower() != expected.lower():
        checks.append(result("git-revision", "blocked", "HEAD differs from supplied --expect-commit"))
    elif expected:
        checks.append(result("git-revision", "ok", "HEAD matches supplied --expect-commit"))
    else:
        checks.append(result("git-revision", "ok", "HEAD observed; no expected commit supplied"))
    return checks
def report(checks: list[dict[str, str]], status: str | None = None) -> dict[str, object]:
    overall = status or (
        "error" if any(item["status"] == "error" for item in checks)
        else "blocked" if any(item["status"] == "blocked" for item in checks)
        else "ok"
    )
    return {"skill": "zurp", "scope": "offline-preflight", "status": overall,
            "checks": checks, "runtime_verified": False}
def emit(data: dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(data, sort_keys=True))
    else:
        print(f"zurp offline preflight: {data['status']}")
        for item in data["checks"]:
            print(f"- {item['name']}: {item['status']} ({item['detail']})")
def main(argv: list[str] | None = None) -> int:
    args_list = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in args_list
    parser = ArgumentParser(description="Audit Zurp prerequisites and checkout shape offline.")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", help="local Zurp checkout to inspect")
    parser.add_argument("--expect-commit", help="full 40-hex commit to compare when --repo is supplied")
    parser.add_argument("--surface", choices=("all", "burp", "mcp"), default="all",
                        help="toolchain to audit: all, burp (Java/Gradle), or mcp (Node/npm)")
    try:
        args = parser.parse_args(args_list)
    except SystemExit as exc:
        return int(exc.code)
    except ValueError as exc:
        emit(report([result("arguments", "error", str(exc))], "error"), as_json)
        return 2
    if args.expect_commit is not None and not re.fullmatch(r"[0-9a-fA-F]{40}", args.expect_commit):
        emit(report([result("arguments", "error", "--expect-commit must be a full 40-hex commit")], "error"), as_json)
        return 2
    if args.expect_commit is not None and not args.repo:
        emit(report([result("arguments", "error", "--expect-commit requires --repo")], "error"), as_json)
        return 2
    checks = host_checks() + tool_checks(args.surface)
    if args.repo:
        checks.extend(repo_checks(args.repo, args.expect_commit))
    data = report(checks)
    emit(data, args.json)
    return 0 if data["status"] == "ok" else 1
if __name__ == "__main__":
    raise SystemExit(main())
