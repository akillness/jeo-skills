#!/usr/bin/env python3
"""Offline google-maps-scraper host and source-checkout preflight.

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

SKILL = "google-maps-scraper"
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
    ("docker", "info", "recommended runtime; the published image bundles Playwright and Chromium"),
    ("go", "info", "needed only to build from source (go.mod sets the minimum)"),
    ("git", "info", "needed only to clone the source or read a checkout's commit"),
    ("node", "info", "needed only by the upstream agent skill's helper scripts"),
)

PROBES = (
    {"name": "telemetry", "path": "runner/runner.go", "pattern": r"DISABLE_TELEMETRY",
     "hit": "runner.go enables anonymous telemetry unless DISABLE_TELEMETRY=1",
     "miss": "no DISABLE_TELEMETRY switch found in runner/runner.go"},
    {"name": "web-auth", "path": "web/web.go", "pattern": r"(?i)authorization|basicauth|api_?key",
     "hit": "web/web.go references authorization handling",
     "miss": "web/web.go has no authorization handling; the Web UI and REST API (default :8080) are unauthenticated, so bind them to loopback"},
    {"name": "go-version", "path": "go.mod", "pattern": r"^go 1\.(2[7-9]|[3-9][0-9])",
     "hit": "go.mod requires Go 1.27 or newer (the README still says Go 1.26.6+); build from source with the go.mod version",
     "miss": "go.mod's go directive is below 1.27; check it against the README"},
    {"name": "provision-pipe", "path": "README.md", "pattern": r"curl -fsSL \S*PROVISION \| sh",
     "hit": "README installs the SaaS edition by piping a remote script into sh",
     "miss": "README no longer pipes PROVISION into sh"},
    {"name": "upstream-skill-self-update", "path": "skills/google-maps-scraper/SKILL.md", "pattern": r"ensure-latest\.sh",
     "hit": "the upstream agent skill runs ensure-latest.sh at the start of every workflow to update itself",
     "miss": "the upstream agent skill no longer references ensure-latest.sh"},
)

MAX_QUERY_BYTES = 1 << 20
README_RATE = "about 120 places per minute at -c 8 -depth 1 and about 16 results per keyword, per the README"


def register_args(parser):
    parser.add_argument("--queries", help="validate a queries file offline (line counts only, no network)")


def host_checks(checks, args):
    system = platform.system()
    note = {"Darwin": "upstream says the Docker command may not work on macOS; see its 'MacOS instructions.md' (Go build)",
            "Windows": "the upstream agent skill documents Windows through WSL"}.get(system, "Docker or a Go build")
    add(checks, "platform", "info", f"{system}/{platform.machine() or 'unknown'}; {note}")
    paths = {name: shutil.which(name) for name in ("docker", "go")}
    add(checks, "runtime", "ok" if any(paths.values()) else "blocked",
        "Docker or Go is available; versions unverified" if any(paths.values())
        else "neither Docker nor Go is on PATH; run the published image or build from source")
    telemetry_off = os.environ.get("DISABLE_TELEMETRY") == "1"
    add(checks, "env", "info",
        f"DISABLE_TELEMETRY={'1 (anonymous telemetry off)' if telemetry_off else 'not 1 (anonymous telemetry on)'}; "
        f"LEADSDB_API_KEY={'set' if os.environ.get('LEADSDB_API_KEY', '').strip() else 'unset'}; values are never read out")
    home = Path.home()
    found = []
    for rel in (".agents/skills", ".claude/skills"):
        data, _ = read_regular(home / rel / "google-maps-scraper" / "SKILL.md", 1 << 20)
        if data is not None:
            kind = ("this catalog's operator (has upstream_commit)" if b"upstream_commit:" in data
                    else "another skill with the same name, likely upstream gosom's, which updates itself")
            found.append(f"~/{rel}: {kind}")
    add(checks, "installed-skill", "info", "; ".join(found) if found
        else "no installed skill folder named google-maps-scraper in ~/.agents/skills or ~/.claude/skills")


def extras(checks, args):
    if not args.queries:
        return
    data, why = read_regular(Path(args.queries), MAX_QUERY_BYTES)
    if data is None:
        add(checks, "queries", "blocked", f"cannot read --queries ({why})")
        return
    lines = [line.strip() for line in data.decode("utf-8", "replace").splitlines()]
    queries = [line for line in lines if line and not line.startswith("#")]
    if not queries:
        add(checks, "queries", "blocked", "the queries file has no usable lines")
        return
    urls = [q for q in queries if q.lower().startswith(("http://", "https://")) or "maps.app.goo.gl" in q]
    duplicates = len(queries) - len({q.lower() for q in queries})
    minutes = max(1, round(len(queries) * 16 / 120))
    add(checks, "queries", "ok", f"{len(queries)} query line(s); {len(urls)} direct Maps URL(s); {duplicates} duplicate(s)")
    add(checks, "queries.estimate", "info", f"about {minutes} minute(s) ({README_RATE}); unverified for your machine")


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
    parser = argparse.ArgumentParser(description="Offline google-maps-scraper host and checkout preflight")
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
