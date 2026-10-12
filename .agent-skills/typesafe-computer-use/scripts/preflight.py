#!/usr/bin/env python3
"""Offline, read-only preflight for the pinned typesafe-computer-use repository."""
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

SKILL = "typesafe-computer-use"
FILES = (
    "pyproject.toml", "README.md", "typesafe_computer_use/cli.py",
    "typesafe_computer_use/config.py", "typesafe_computer_use/decide.py",
    "typesafe_computer_use/actions.py", "typesafe_computer_use/runner.py",
    "typesafe_computer_use/writer.py", "docs/how-a-step-works.md",
    "docs/browser-backend.md", "docs/writer-endpoints.md", "docs/run-folder.md",
)

def add(checks, name, status, detail, required=True):
    checks.append({"name": name, "status": status, "required": required, "detail": detail})

def chrome_candidates(system):
    names = ("google-chrome", "chromium", "chromium-browser") if system == "Darwin" else ("chrome", "google-chrome", "chromium")
    paths = {
        "Darwin": (
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ),
        "Windows": (
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
            "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
            "C:/Program Files/Chromium/Application/chrome.exe",
        ),
    }.get(system, ())
    return names, tuple(Path(p) for p in paths)

def native_candidates(system):
    return {
        "Darwin": (
            Path("/System/Library/Frameworks/Vision.framework"),
            Path("/System/Library/Frameworks/ApplicationServices.framework"),
        ),
        "Windows": (
            Path("C:/Windows/System32/UIAutomationCore.dll"),
            Path("C:/Windows/System32/user32.dll"),
        ),
    }.get(system, ())

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    json_mode = "--json" in argv
    parser = argparse.ArgumentParser(description="Offline preflight; never opens a screen or starts a process.")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", type=Path, help="local upstream checkout to inspect")
    parser.add_argument("--expect-commit", help="expected full 40-hex Git commit (requires --repo)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        if exc.code == 0:
            return 0
        if json_mode:
            print(json.dumps({"skill": SKILL, "scope": "offline-preflight", "status": "error",
                              "checks": [{"name": "input", "status": "error", "required": True,
                                          "detail": "invalid command-line arguments"}],
                              "runtime_verified": False}))
        return 2

    def invalid(detail):
        result = {"skill": SKILL, "scope": "offline-preflight", "status": "error",
                  "checks": [{"name": "input", "status": "error", "required": True, "detail": detail}],
                  "runtime_verified": False}
        if args.json:
            print(json.dumps(result, sort_keys=True))
        else:
            print(f"{SKILL} offline preflight: error\n- input: {detail}")
        return 2

    if args.expect_commit is not None and (not args.repo or not re.fullmatch(r"[0-9a-fA-F]{40}", args.expect_commit)):
        return invalid("--expect-commit requires --repo and a full 40-hex SHA")
    if args.repo and (not args.repo.exists() or not args.repo.is_dir()):
        return invalid("--repo must name an existing directory")
    checks = []
    py = sys.version_info
    add(checks, "python", "ok" if py >= (3, 12) else "blocked",
        f"Python {py.major}.{py.minor}.{py.micro}; requires >=3.12")
    uv = shutil.which("uv")
    add(checks, "uv", "ok" if uv else "blocked",
        f"found at {uv}" if uv else "uv is not on PATH; command not executed")

    system = platform.system()
    if system == "Darwin":
        raw = platform.mac_ver()[0]
        try:
            mac_major = int(raw.split(".", 1)[0])
        except (ValueError, IndexError):
            mac_major = 0
        add(checks, "platform", "ok" if mac_major >= 14 else "blocked",
            f"macOS {raw or 'unknown'}; primary adapter requires >=14; permissions not inspected")
    elif system == "Windows":
        raw = platform.win32_ver()[0] or platform.release()
        supported = raw.startswith(("10", "11"))
        add(checks, "platform", "ok" if supported else "blocked",
            f"Windows {raw or 'unknown'}; UI Automation/SendInput/OCR support is experimental")
    else:
        add(checks, "platform", "blocked", f"{system or 'unknown'} is not a supported target")
    arch = platform.machine()
    add(checks, "arch", "ok" if arch else "blocked",
        f"{arch or 'unknown'}; static architecture report only")
    names, paths = chrome_candidates(system)
    chrome_cmd = next((shutil.which(name) for name in names if shutil.which(name)), None)
    chrome_path = next((path for path in paths if path.is_file()), None)
    native = next((path for path in native_candidates(system) if path.exists()), None)
    add(checks, "chrome", "ok" if (chrome_cmd or chrome_path) else "blocked",
        (f"static Chrome path available ({chrome_cmd or chrome_path}); browser session not inspected"
         if (chrome_cmd or chrome_path) else "Chrome executable not found; clicker-bench is unavailable"),
        required=False)
    add(checks, "adapter_paths", "ok" if native or chrome_cmd or chrome_path else "blocked",
        (f"static OS adapter path available ({native or chrome_cmd or chrome_path}); activation/permissions not tested"
         if (native or chrome_cmd or chrome_path) else "no Chrome or OS adapter path found"))
    if args.repo:
        missing = [item for item in FILES if not (args.repo / item).is_file()]
        add(checks, "source_shape", "ok" if not missing else "blocked",
            "required pinned source files present" if not missing else "missing: " + ", ".join(missing))
        repo_root = args.repo.resolve()
        git_bin = shutil.which("git")
        host_env = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
        git_env = {key: os.environ[key] for key in host_env if key in os.environ}
        git_env.update({
            "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0",
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_ALLOW_PROTOCOL": "", "LC_ALL": "C",
        })
        if not git_bin:
            add(checks, "git_commit", "blocked", "git is not on PATH; no command executed")
        else:
            try:
                root_proc = subprocess.run([git_bin, "rev-parse", "--show-toplevel"], cwd=str(repo_root),
                                           env=git_env, capture_output=True, text=True, check=False, timeout=5)
                git_root = Path(root_proc.stdout.strip()).resolve() if root_proc.returncode == 0 else None
                if git_root != repo_root:
                    add(checks, "git_commit", "blocked",
                        f"Git top-level {git_root or 'unavailable'} does not match --repo {repo_root}")
                else:
                    proc = subprocess.run([git_bin, "rev-parse", "--verify", "HEAD"], cwd=str(repo_root),
                                          env=git_env, capture_output=True, text=True, check=False, timeout=5)
                    commit = proc.stdout.strip()
                    if proc.returncode or not re.fullmatch(r"[0-9a-fA-F]{40}", commit):
                        add(checks, "git_commit", "blocked", "local checkout has no readable HEAD commit")
                    elif args.expect_commit and commit.lower() != args.expect_commit.lower():
                        add(checks, "git_commit", "blocked", f"HEAD {commit} does not match --expect-commit")
                    else:
                        add(checks, "git_commit", "ok", f"HEAD {commit}; compared only with caller pin" if args.expect_commit else f"HEAD {commit}")
            except subprocess.TimeoutExpired:
                add(checks, "git_commit", "blocked", "local git rev-parse timed out")
            except OSError as exc:
                add(checks, "git_commit", "blocked", f"could not run local git rev-parse: {exc}")
    else:
        add(checks, "source_shape", "not_checked", "pass --repo to inspect local public source shape", required=False)
        add(checks, "git_commit", "not_checked", "pass --repo and --expect-commit to compare a local pin", required=False)
    add(checks, "safety_scope", "not_checked",
        "offline only; screen, account/config/keys, processes, browser sessions, permissions, and provider readiness not inspected",
        required=False)
    status = "blocked" if any(c["required"] and c["status"] != "ok" for c in checks) else "ok"
    result = {"skill": SKILL, "scope": "offline-preflight", "status": status,
              "checks": checks, "runtime_verified": False}
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"{SKILL} offline preflight: {status}")
        for check in checks:
            print(f"- {check['name']}: {check['status']} — {check['detail']}")
    return 0 if status == "ok" else 1

if __name__ == "__main__":
    raise SystemExit(main())
