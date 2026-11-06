#!/usr/bin/env python3
"""Offline gitingest host and source-checkout preflight.

Reads host facts and, with --repo, a local checkout. It never runs the upstream
project, a package manager, a browser, or any tool it discovers; it opens no
sockets and writes nothing. `runtime_verified` is always false: a tool on PATH or a
matching file hash is not proof that the software works.

Exit codes: 0 every blocking check passed, 1 at least one check blocks, 2 invalid input.
`info` checks are advisory findings and never change the status.
"""
from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

SKILL = "gitingest"
SOURCE = Path(__file__).resolve().parents[1] / "references" / "source.json"
COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
HOST_ENV_KEYS = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
MAX_HASH_BYTES = 8 << 20
MAX_PROBE_BYTES = 2 << 20
MAX_CONFIG_BYTES = 1 << 20


def add(checks, name, state, detail):
    checks.append({"name": name, "status": state, "detail": detail})


def summarize(checks, forced=""):
    if forced:
        status = forced
    else:
        states = {c["status"] for c in checks}
        status = "error" if "error" in states else "blocked" if "blocked" in states else "ok"
    return {"skill": SKILL, "scope": "offline-preflight", "status": status, "checks": checks,
            "runtime_verified": False}


def invalid(message):
    return summarize([{"name": "input", "status": "error", "detail": message}], "error")


def load_source():
    try:
        return json.loads(SOURCE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def git_output(git, repo, *args):
    env = {key: os.environ[key] for key in HOST_ENV_KEYS if key in os.environ}
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    try:
        done = subprocess.run([git, *args], cwd=str(repo), capture_output=True, text=True,
                              timeout=2, check=False, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return "", type(exc).__name__
    if done.returncode != 0:
        return "", f"exit {done.returncode}"
    return done.stdout.strip(), ""


def read_regular(path, cap):
    """Return (bytes, "") for a regular, non-symlink file up to cap bytes, else (None, reason)."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        if exc.errno in (errno.ENOENT, errno.ENOTDIR):
            return None, "missing"
        if exc.errno == errno.ELOOP:
            return None, "symlink"
        return None, f"unreadable ({exc.strerror or exc.errno})"
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            return None, "not a regular file"
        if info.st_size > cap:
            return None, f"larger than {cap} bytes"
        with os.fdopen(fd, "rb", closefd=False) as handle:
            return handle.read(cap + 1), ""
    finally:
        os.close(fd)


def contained(root, rel):
    try:
        return root in (root / rel).resolve().parents
    except (OSError, RuntimeError):
        return False


def tool_checks(checks, tools):
    """tools: (name, state when missing, why it matters). Versions are never executed."""
    paths = {}
    for name, missing, why in tools:
        found = shutil.which(name)
        if found:
            paths[name] = found
            add(checks, f"tool:{name}", "ok", f"found at {found}; version unverified")
        else:
            add(checks, f"tool:{name}", missing, f"{name} is not on PATH; {why}")
    return paths


def env_report(checks, name, keys, note=""):
    parts = [f"{key}={'set' if os.environ.get(key, '').strip() else 'unset'}" for key in keys]
    add(checks, name, "info", "; ".join(parts) + ("; " + note if note else "") + "; values are never read out")


def verify_source(checks, root, source):
    missing, differs, unsafe = [], [], []
    for entry in source["files"]:
        rel = entry["path"]
        if not contained(root, rel):
            unsafe.append(f"{rel} (resolves outside the checkout)")
            continue
        data, why = read_regular(root / rel, MAX_HASH_BYTES)
        if data is None:
            (missing if why == "missing" else unsafe).append(rel if why == "missing" else f"{rel} ({why})")
        elif hashlib.sha256(data).hexdigest() != entry["sha256"]:
            differs.append(rel)
    if missing or unsafe:
        problems = [f"missing {', '.join(missing)}"] if missing else []
        problems += [f"unsafe {', '.join(unsafe)}"] if unsafe else []
        add(checks, "repo.shape", "blocked", "; ".join(problems))
    else:
        add(checks, "repo.shape", "ok", f"all {len(source['files'])} pinned public files are present as regular files")
    if differs:
        add(checks, "repo.files", "blocked",
            f"{len(differs)} pinned file(s) differ from audited commit {source['commit'][:12]}: "
            + ", ".join(differs) + "; this skill's guidance was audited against that commit, so re-audit before relying on it")
    elif not (missing or unsafe):
        add(checks, "repo.files", "ok", f"every pinned file hash matches audited commit {source['commit'][:12]}")


def run_probes(checks, root, probes):
    for probe in probes:
        data, why = read_regular(root / probe["path"], MAX_PROBE_BYTES)
        if data is None or not contained(root, probe["path"]):
            add(checks, "audit:" + probe["name"], "info", f"{probe['path']} is unavailable ({why or 'outside checkout'}); not assessed")
            continue
        count = len(re.findall(probe["pattern"], data.decode("utf-8", "replace"), re.M))
        add(checks, "audit:" + probe["name"], "info", probe["hit"] if count > probe.get("more_than", 0) else probe["miss"])


def inspect_repo(checks, args, git, source):
    repo = Path(args.repo)
    if not repo.exists():
        add(checks, "repo.path", "blocked", "checkout path does not exist")
        return
    if not repo.is_dir():
        add(checks, "repo.path", "blocked", "checkout path is not a directory")
        return
    root = repo.resolve()
    if os.path.lexists(root / ".git"):
        if not git:
            add(checks, "repo.git", "blocked", "git is required to inspect checkout identity")
        else:
            top, error = git_output(git, root, "rev-parse", "--show-toplevel")
            if not top:
                add(checks, "repo.git", "blocked", f"cannot resolve checkout root ({error})")
            elif Path(top).resolve() != root:
                add(checks, "repo.git", "blocked", "Git root differs from --repo; checkout identity withheld")
            else:
                add(checks, "repo.git", "ok", "bounded local Git root matches --repo")
                head, error = git_output(git, root, "rev-parse", "HEAD")
                if not head:
                    add(checks, "repo.commit", "blocked", f"cannot resolve HEAD ({error})")
                elif args.expect_commit and head.lower() != args.expect_commit.lower():
                    add(checks, "repo.commit", "blocked", "HEAD does not match --expect-commit")
                else:
                    suffix = " and matches --expect-commit" if args.expect_commit else ""
                    pin = "" if head.lower() == source["commit"].lower() else f"; differs from audited commit {source['commit'][:12]}"
                    add(checks, "repo.commit", "ok", f"HEAD {head}{suffix}{pin}")
    elif args.expect_commit:
        add(checks, "repo.commit", "blocked", "no .git directory, so --expect-commit cannot be verified")
    else:
        add(checks, "repo.commit", "info", "no .git directory; checkout identified by pinned file hashes only")
    verify_source(checks, root, source)
    run_probes(checks, root, PROBES)


TOOLS = (
    ("git", "info", "a remote URL source is cloned with git; local directories need no git"),
    ("gitingest", "info", "the CLI entry point installed by pip install gitingest"),
)

PROBES = (
    {"name": "ignore-secrets", "path": "src/gitingest/utils/ignore_patterns.py", "pattern": r"(?i)\.pem|id_rsa|credential|secret|\.key\b",
     "hit": "the default ignore list mentions key, certificate, or credential patterns",
     "miss": "the default ignore list has no key, certificate, or credential patterns (its .env entry sits in the virtual-environment group); sensitive files under other names can enter a digest"},
    {"name": "token-in-url", "path": "src/gitingest/utils/git_utils.py", "pattern": r"x-oauth-basic:\{token\}@",
     "hit": "the PAT is embedded in the clone URL as x-oauth-basic:<token>@host, so it is in the git process arguments while the clone runs",
     "miss": "the clone URL no longer embeds the PAT as x-oauth-basic"},
    {"name": "size-caps", "path": "src/gitingest/config.py", "pattern": r"MAX_FILES = 10_000",
     "hit": "upstream caps ingestion at 10,000 files, 10 MiB per file, and 500 MiB total output",
     "miss": "MAX_FILES differs from the audited 10,000; read src/gitingest/config.py for the current limits"},
    {"name": "library-telemetry", "path": "src/gitingest/entrypoint.py", "pattern": r"(?i)posthog|sentry",
     "hit": "entrypoint.py references posthog or sentry",
     "miss": "no posthog or sentry reference in the library entrypoint; the README places analytics and error tracking in the hosted site and server stack"},
    {"name": "hub-to-ingest", "path": "README.md", "pattern": r"[Rr]eplace `hub` with `ingest`",
     "hit": "the README documents replacing 'hub' with 'ingest' in a GitHub URL, which sends the repository URL to the hosted gitingest.com service",
     "miss": "the README no longer documents the hub-to-ingest URL trick"},
)

SENSITIVE_NAMES = re.compile(
    r"^(\.env\..+|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.kdbx|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|\.npmrc|\.pypirc|\.netrc|"
    r"credentials(\..+)?|secrets?(\..+)?|service[-_]account.*\.json)$", re.IGNORECASE)
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__"}
MAX_WALK = 20000
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 10000


def register_args(parser):
    parser.add_argument("--target", help="scan a local directory you plan to ingest (names and sizes only, contents never read)")


def host_checks(checks, args):
    py = sys.version_info
    add(checks, "python", "ok" if py >= (3, 8) else "blocked",
        f"Python {py.major}.{py.minor}.{py.micro}; gitingest requires Python 3.8 or newer")
    env_report(checks, "env", ("GITHUB_TOKEN",),
               "the CLI reads GITHUB_TOKEN automatically for GitHub URLs, so unset it when ingesting a public repository")


def extras(checks, args):
    if not args.target:
        return
    target = Path(args.target)
    if not target.is_dir():
        add(checks, "target", "blocked", "--target is not a directory")
        return
    files = big = walked = total = 0
    flagged = []
    base = target.resolve()
    stack = [base]
    truncated = False
    while stack and not truncated:
        current = stack.pop()
        try:
            entries = list(os.scandir(current))
        except OSError:
            continue
        for entry in entries:
            walked += 1
            if walked > MAX_WALK:
                truncated = True
                break
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir(follow_symlinks=False):
                    if entry.name not in SKIP_DIRS:
                        stack.append(Path(entry.path))
                    continue
                if not entry.is_file(follow_symlinks=False):
                    continue
                size = entry.stat(follow_symlinks=False).st_size
            except OSError:
                continue
            files += 1
            total += size
            big += size > MAX_FILE_BYTES
            if SENSITIVE_NAMES.match(entry.name) and len(flagged) < 10:
                flagged.append(os.path.relpath(entry.path, base))
    add(checks, "target", "ok", f"{files} file(s), {total} bytes, {big} over 10 MiB" + ("; walk stopped at the entry cap" if truncated else ""))
    add(checks, "target.limits", "info",
        f"{'exceeds' if files > MAX_FILES else 'within'} upstream's 10,000-file cap; "
        f"{'some files exceed' if big else 'no file exceeds'} the 10 MiB per-file cap")
    add(checks, "target.sensitive-names", "info",
        ("sensitive-looking file names (names only): " + ", ".join(flagged)
         + "; a plain .env is on gitingest's default ignore list but these names are not (observed with 0.3.1), and a digest is meant to be pasted into a model")
        if flagged else "no sensitive-looking file names found; contents are never read, so secrets inside ordinary files are not detected")


def build(args):
    checks = []
    source = load_source()
    if not source:
        add(checks, "source.pin", "error", "references/source.json is missing or unreadable")
        return summarize(checks)
    add(checks, "source.pin", "info", f"{source['repository']} @ {source['commit']} ({source['license']['spdx']})")
    host_checks(checks, args)
    paths = tool_checks(checks, TOOLS)
    extras(checks, args)
    if args.repo:
        inspect_repo(checks, args, paths.get("git") or shutil.which("git"), source)
    return summarize(checks)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser(description="Offline gitingest host and checkout preflight")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", help="local checkout to inspect")
    parser.add_argument("--expect-commit", help="compare checkout HEAD to this full SHA (requires --repo)")
    register_args(parser)
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        if exc.code == 0:
            return 0
        print(json.dumps(invalid("invalid command-line arguments"), sort_keys=True) if "--json" in argv
              else f"{SKILL} offline-preflight: invalid input")
        return 2
    problem = ""
    if args.expect_commit is not None and not args.repo:
        problem = "--expect-commit requires --repo"
    elif args.expect_commit is not None and not COMMIT_RE.fullmatch(args.expect_commit):
        problem = "--expect-commit must be a full 40-character hexadecimal SHA"
    if problem:
        print(json.dumps(invalid(problem), sort_keys=True) if args.json else f"{SKILL} offline-preflight: invalid input")
        return 2
    data = build(args)
    if args.json:
        print(json.dumps(data, sort_keys=True))
    else:
        print(f"{SKILL} offline-preflight: {data['status']}")
        for check in data["checks"]:
            print(f"- {check['name']}: {check['status']} - {check['detail']}")
    return 0 if data["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
