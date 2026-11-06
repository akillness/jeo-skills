#!/usr/bin/env python3
"""Offline Fabric host and source-checkout preflight.

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

SKILL = "fabric"
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
    ("git", "info", "needed only to read a checkout's commit"),
    ("yt-dlp", "info", "fabric --youtube shells out to yt-dlp for transcripts and comments"),
    ("ffmpeg", "info", "fabric --visual and splitting large audio files shell out to ffmpeg"),
)

PROBES = (
    {"name": "default-bind", "path": "internal/cli/flags.go", "pattern": r"default:\"127\.0\.0\.1:8080\"",
     "hit": "fabric --serve binds 127.0.0.1:8080 by default (loopback only)",
     "miss": "the default --address is not 127.0.0.1:8080; bind explicitly and check flags.go"},
    {"name": "non-loopback-needs-key", "path": "internal/server/auth.go", "pattern": r"func requireAPIKeyForBind",
     "hit": "a non-loopback --address is refused unless --api-key or FABRIC_API_KEY is set",
     "miss": "no bind guard found in auth.go; treat any non-loopback --serve as unauthenticated"},
    {"name": "api-key-from-env", "path": "internal/cli/flags.go", "pattern": r"env:\"FABRIC_API_KEY\"",
     "hit": "the server key can come from FABRIC_API_KEY, which keeps it off the command line (--api-key puts it in the process list)",
     "miss": "FABRIC_API_KEY is no longer read; check how the server key is supplied"},
    {"name": "env-file-mode", "path": "internal/plugins/db/fsdb/db.go", "pattern": r"writeFileAtomic\(o\.EnvFilePath, \[\]byte\(content\), 0600\)",
     "hit": "~/.config/fabric/.env is written with mode 0600 by this version; older versions saved it with 0644",
     "miss": "the .env write mode is not 0600 in db.go; check the file's permissions"},
    {"name": "patterns-source", "path": "internal/tools/patterns_loader.go",
     "pattern": r"DefaultPatternsGitRepoUrl = \"https://github\.com/danielmiessler/fabric\.git\"",
     "hit": "setup and --updatepatterns fetch patterns from that GitHub repository at run time; the content is not pinned to this audit",
     "miss": "the default patterns repository differs; read patterns_loader.go before running setup"},
    {"name": "jina-scrape", "path": "internal/cli/flags.go", "pattern": r"using Jina AI",
     "hit": "--scrape_url and --scrape_question send the URL or question to Jina AI",
     "miss": "the Jina AI scrape flags were not found in flags.go"},
)

PROVIDER_KEYS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "MISTRAL_API_KEY",
                 "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY")


def register_args(parser):
    pass


def host_checks(checks, args):
    system = platform.system()
    add(checks, "platform", "ok" if system in ("Darwin", "Linux", "Windows") else "blocked",
        f"{system}/{platform.machine() or 'unknown'}; upstream documents macOS, Linux and Windows installs")
    found = [f"{name} at {path}" for name in ("fabric", "fabric-ai") if (path := shutil.which(name))]
    add(checks, "tool:fabric", "ok" if found else "blocked",
        "found " + ", ".join(found) + "; version unverified, and another tool may share the name; Homebrew and Arch installs expose it as fabric-ai"
        if found else "neither fabric nor fabric-ai is on PATH; installing is a separate approval (README: install.sh pipe, Homebrew fabric-ai, winget, go install)")
    config = Path.home() / ".config" / "fabric"
    env_file = config / ".env"
    patterns = config / "patterns"
    add(checks, "config.dir", "info",
        "~/.config/fabric exists" if config.is_dir() else "~/.config/fabric is absent; fabric --setup creates it and downloads patterns over the network")
    try:
        info = os.lstat(env_file)
    except OSError:
        add(checks, "config.env", "info", "no ~/.config/fabric/.env; provider keys are not configured yet")
    else:
        if stat.S_ISLNK(info.st_mode):
            add(checks, "config.env", "info", "~/.config/fabric/.env is a symlink; contents are never read")
        else:
            wide = stat.S_IMODE(info.st_mode) & 0o077
            add(checks, "config.env", "info",
                "~/.config/fabric/.env exists; contents are never read"
                + ("; readable by group or others, restrict it to 0600" if wide else "; owner-only permissions"))
    try:
        count = sum(1 for _ in os.scandir(patterns))
        add(checks, "config.patterns", "info", f"~/.config/fabric/patterns has {count} entries")
    except OSError:
        add(checks, "config.patterns", "info", "no ~/.config/fabric/patterns directory yet")
    env_report(checks, "env", ("FABRIC_API_KEY", "FABRIC_CORS_ORIGINS") + PROVIDER_KEYS,
               "provider keys normally live in ~/.config/fabric/.env, so unset here does not mean unconfigured")


def extras(checks, args):
    return None


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
    parser = argparse.ArgumentParser(description="Offline Fabric host and checkout preflight")
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
