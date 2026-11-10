#!/usr/bin/env python3
"""Offline revfactory/harness host, pinned-source, and destination preflight.

Only a bounded local git rev-parse is executed, with inherited Git configuration
and environment overrides disabled. Claude, plugins, upstream code, credentials,
and the network are never used. No project or host configuration is written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys

SKILL = "revfactory-harness"
SOURCE = Path(__file__).resolve().parents[1] / "references" / "source.json"
COMMIT_RE = re.compile(r"[0-9a-fA-F]{40}\Z")
HASH_RE = re.compile(r"[0-9a-f]{64}\Z")
MAX_BYTES = 1 << 20
HOST_ENV_KEYS = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")


def add(checks, name, status, detail):
    checks.append({"name": name, "status": status, "detail": detail})


def report(checks):
    states = {item["status"] for item in checks}
    status = "error" if "error" in states else "blocked" if "blocked" in states else "ok"
    return {"skill": SKILL, "scope": "offline-preflight", "status": status,
            "checks": checks, "runtime_verified": False}


def regular_bytes(root, relative):
    """Read a bounded public file; reject symlinks, directories, and special files."""
    current = root
    try:
        for part in PurePosixPath(relative).parts:
            current = current / part
            if stat.S_ISLNK(current.lstat().st_mode):
                return None, "symlinked public path"
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        fd = os.open(current, flags)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode):
                return None, "not a regular file"
            if info.st_size > MAX_BYTES:
                return None, "public file exceeds size limit"
            with os.fdopen(fd, "rb", closefd=False) as handle:
                data = handle.read(MAX_BYTES + 1)
            return (None, "public file exceeds size limit") if len(data) > MAX_BYTES else (data, "")
        finally:
            os.close(fd)
    except OSError as exc:
        return None, type(exc).__name__


def load_source():
    data, error = regular_bytes(SOURCE.parent, SOURCE.name)
    if data is None:
        raise ValueError("source manifest unavailable: " + error)
    source = json.loads(data)
    if (not isinstance(source, dict) or source.get("schema_version") != 1
            or source.get("skill") != SKILL or source.get("repository") != "revfactory/harness"
            or not isinstance(source.get("commit"), str) or not COMMIT_RE.fullmatch(source["commit"])
            or not isinstance(source.get("files"), list) or not source["files"]):
        raise ValueError("invalid source manifest")
    seen = set()
    for item in source["files"]:
        if not isinstance(item, dict):
            raise ValueError("invalid source file record")
        rel, digest = item.get("path"), item.get("sha256")
        if (not isinstance(rel, str) or not rel or PurePosixPath(rel).is_absolute()
                or ".." in PurePosixPath(rel).parts or "\\" in rel or rel in seen
                or not isinstance(digest, str) or not HASH_RE.fullmatch(digest)):
            raise ValueError("invalid source file path or checksum")
        seen.add(rel)
    return source


def directory_root(value, checks, name):
    path = Path(os.path.abspath(Path(value).expanduser()))
    try:
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            add(checks, name, "blocked", "expected a directory, not a symlink or special file")
            return None
        return path.resolve()
    except (OSError, RuntimeError) as exc:
        add(checks, name, "blocked", "cannot inspect directory: " + type(exc).__name__)
        return None


def git_identity(root, git):
    env = {key: os.environ[key] for key in HOST_ENV_KEYS if key in os.environ}
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    try:
        done = subprocess.run([git, "-C", str(root), "rev-parse", "--show-toplevel", "HEAD"],
                              capture_output=True, text=True, timeout=5, check=False, env=env)
    except (OSError, subprocess.TimeoutExpired):
        return None
    lines = done.stdout.splitlines()
    if done.returncode or len(lines) != 2 or not COMMIT_RE.fullmatch(lines[1]):
        return None
    try:
        if Path(lines[0]).resolve() != root:
            return None
    except (OSError, RuntimeError):
        return None
    return lines[1].lower()


def inspect_repo(value, expected, source, checks):
    root = directory_root(value, checks, "repo.path")
    if root is None:
        return
    git = shutil.which("git")
    observed = git_identity(root, git) if git and os.path.lexists(root / ".git") else None
    matches = observed == source["commit"].lower() and (expected is None or observed == expected.lower())
    add(checks, "repo.commit", "ok" if matches else "blocked",
        "HEAD matches the audited source pin" if matches else "cannot verify HEAD against the audited source pin")
    for item in source["files"]:
        data, error = regular_bytes(root, item["path"])
        if data is None:
            add(checks, "repo.file:" + item["path"], "blocked", error)
        else:
            matches = hashlib.sha256(data).hexdigest() == item["sha256"]
            add(checks, "repo.file:" + item["path"], "ok" if matches else "blocked",
                "SHA-256 matches" if matches else "SHA-256 differs; re-audit before relying on this checkout")


def inspect_project(value, checks):
    root = directory_root(value, checks, "project.path")
    if root is None:
        return
    paths = ((".claude", True), (".claude/agents", True), (".claude/skills", True), ("CLAUDE.md", False))
    unsafe = False
    for relative, is_directory in paths:
        if unsafe and relative.startswith(".claude/"):
            continue
        try:
            info = (root / relative).lstat()
            valid = not stat.S_ISLNK(info.st_mode) and (stat.S_ISDIR(info.st_mode) if is_directory else stat.S_ISREG(info.st_mode))
            add(checks, "project.path:" + relative, "info" if valid else "blocked",
                "exists; preserve existing content" if valid else "unsafe destination type; do not overwrite or follow")
            if relative == ".claude" and not valid:
                unsafe = True
        except FileNotFoundError:
            add(checks, "project.path:" + relative, "info", "absent; creation requires a scoped request")
        except OSError as exc:
            add(checks, "project.path:" + relative, "blocked", type(exc).__name__)
            if relative == ".claude":
                unsafe = True
    # Presence only. Never read user skills, settings, authentication files, or .env.
    skill_root = root / ".claude" / "skills"
    if not unsafe and not skill_root.is_symlink() and skill_root.is_dir():
        for name in ("harness", "harness-evolve", "evolve"):
            if os.path.lexists(skill_root / name):
                add(checks, "project.collision:" + name, "warning",
                    "direct-copy destination already exists; identify ownership and do not overwrite")


def main(argv=None):
    raw = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", help="local upstream checkout to inspect")
    parser.add_argument("--expect-commit", help="full checkout SHA; requires --repo and the audited pin")
    parser.add_argument("--project", help="inspect destination types and name collisions without reading project files")
    try:
        args = parser.parse_args(raw)
    except SystemExit as exc:
        if exc.code == 0:
            return 0
        payload = report([{"name": "input", "status": "error", "detail": "invalid command-line arguments"}])
    else:
        checks = []
        if args.expect_commit is not None and (not args.repo or not COMMIT_RE.fullmatch(args.expect_commit)):
            add(checks, "input", "error", "--expect-commit requires --repo and a full 40-hex SHA")
        else:
            try:
                source = load_source()
            except (OSError, ValueError, TypeError):
                add(checks, "source", "error", "source manifest is unavailable or invalid")
            else:
                add(checks, "python", "ok" if sys.version_info >= (3, 10) else "blocked", "Python 3.10+ required")
                add(checks, "claude", "ok" if shutil.which("claude") else "blocked",
                    "Claude Code presence only; authentication, tools, models, and plugin activation are not verified")
                add(checks, "source", "ok", "audited pin " + source["commit"])
                if args.repo:
                    inspect_repo(args.repo, args.expect_commit, source, checks)
                if args.project:
                    inspect_project(args.project, checks)
        payload = report(checks)
    if "--json" in raw:
        print(json.dumps(payload, sort_keys=True))
    else:
        print(f"{SKILL} offline-preflight: {payload['status']}")
        for item in payload["checks"]:
            print(f"- {item['name']}: {item['status']} - {item['detail']}")
    return {"ok": 0, "blocked": 1, "error": 2}[payload["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
