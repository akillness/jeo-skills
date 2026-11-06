#!/usr/bin/env python3
"""Offline MoneyPrinterV2 host and source-checkout preflight.

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

SKILL = "moneyprinter-v2"
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
    ("ollama", "info", "text generation calls an Ollama server, local or remote"),
    ("go", "info", "the Outreach feature builds the Maps scraper with Go"),
)

PROBES = (
    {"name": "scheduler", "path": "src/main.py", "pattern": r"run_pending",
     "hit": "src/main.py calls schedule.run_pending(), so in-app CRON jobs can fire while the app stays open",
     "miss": "src/main.py has no schedule.run_pending() call, so jobs registered from the CRON menu are not executed by that process; schedule src/cron.py from the OS instead"},
    {"name": "kills-firefox", "path": "src/utils.py", "pattern": r"pkill firefox|taskkill /f /im firefox\.exe",
     "hit": "src/utils.py force-kills every running Firefox process (pkill / taskkill) before browser automation; save browser work first",
     "miss": "no force-kill of Firefox found in src/utils.py"},
    {"name": "outreach-build", "path": "src/classes/Outreach.py", "pattern": r"\"go\",\s*\"build\"",
     "hit": "Outreach downloads the zip named by config google_maps_scraper, extracts it, and runs go mod download and go build",
     "miss": "no go build call found in src/classes/Outreach.py"},
    {"name": "cron-needs-model", "path": "src/cron.py", "pattern": r"No Ollama model specified",
     "hit": "src/cron.py exits with an error unless an Ollama model name is passed as the third argument",
     "miss": "src/cron.py no longer requires a model argument"},
    {"name": "smtp-plaintext", "path": "src/config.py", "pattern": r"\[\"email\"\]",
     "hit": "SMTP username and password are read from the email block of config.json in plaintext",
     "miss": "src/config.py no longer reads an email block from config.json"},
    {"name": "docs-drift", "path": "docs/YouTube.md", "pattern": r"\"image_model\"",
     "hit": "docs/YouTube.md still lists llm and image_model config keys that config.example.json does not define; trust config.example.json and src/config.py",
     "miss": "docs/YouTube.md no longer lists the stale llm/image_model keys"},
)


def register_args(parser):
    parser.add_argument("--config", help="inspect a config.json offline (reports set/unset, never values)")


def host_checks(checks, args):
    add(checks, "platform", "info",
        f"{platform.system()}/{platform.machine() or 'unknown'}; upstream states no platform matrix (its scripts reference macOS and Windows paths)")
    py = sys.version_info
    found = shutil.which("python3.12")
    if (py.major, py.minor) == (3, 12):
        add(checks, "python", "ok", f"running interpreter is Python {py.major}.{py.minor}.{py.micro}; upstream requires 3.12")
    elif found:
        add(checks, "python", "ok", f"python3.12 found at {found}; version unverified (upstream requires 3.12)")
    else:
        add(checks, "python", "blocked", "Python 3.12 not found; upstream README and .python-version require 3.12")
    firefox = shutil.which("firefox") or ("/Applications/Firefox.app" if Path("/Applications/Firefox.app").is_dir() else "")
    add(checks, "tool:firefox", "ok" if firefox else "info",
        f"found at {firefox}; version unverified" if firefox else "Firefox not found; Twitter, YouTube and affiliate automation drive a logged-in Firefox profile")
    magick = shutil.which("magick") or shutil.which("convert")
    add(checks, "tool:imagemagick", "ok" if magick else "info",
        f"found at {magick}; version unverified" if magick else "ImageMagick not found; MoviePy subtitle rendering needs it")
    env_report(checks, "env", ("GEMINI_API_KEY", "POST_BRIDGE_API_KEY"))


def secret_state(value):
    return "set" if isinstance(value, str) and value.strip() else "unset"


def extras(checks, args):
    if not args.config:
        return
    data, why = read_regular(Path(args.config), MAX_CONFIG_BYTES)
    if data is None:
        add(checks, "config", "blocked", f"cannot read --config ({why})")
        return
    try:
        cfg = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        add(checks, "config", "blocked", "--config is not valid UTF-8 JSON")
        return
    if not isinstance(cfg, dict):
        add(checks, "config", "blocked", "--config must contain a JSON object")
        return
    add(checks, "config", "ok", "config.json parsed; only set/unset facts follow")
    profile = cfg.get("firefox_profile")
    add(checks, "config.firefox_profile", "info",
        "unset; Twitter and YouTube automation need a logged-in profile" if secret_state(profile) == "unset"
        else "set; directory exists" if Path(profile).is_dir() else "set; directory does not exist")
    host = ""
    try:
        from urllib.parse import urlsplit
        host = urlsplit(str(cfg.get("ollama_base_url", "http://127.0.0.1:11434"))).hostname or ""
    except ValueError:
        pass
    add(checks, "config.ollama", "info",
        f"{'loopback' if host in ('127.0.0.1', 'localhost', '::1') else 'non-loopback'} host; model {secret_state(cfg.get('ollama_model'))}"
        " (unset means the app asks interactively)")
    add(checks, "config.image_key", "info",
        f"nanobanana2_api_key {secret_state(cfg.get('nanobanana2_api_key'))}; GEMINI_API_KEY fallback "
        f"{'set' if os.environ.get('GEMINI_API_KEY', '').strip() else 'unset'}")
    email = cfg.get("email") if isinstance(cfg.get("email"), dict) else {}
    add(checks, "config.smtp", "info",
        f"username {secret_state(email.get('username'))}; password {secret_state(email.get('password'))}"
        + ("; a set password is stored in plaintext in this file" if secret_state(email.get("password")) == "set" else ""))
    bridge = cfg.get("post_bridge") if isinstance(cfg.get("post_bridge"), dict) else {}
    add(checks, "config.post_bridge", "info",
        f"enabled={bool(bridge.get('enabled'))}; auto_crosspost={bool(bridge.get('auto_crosspost'))}; api_key {secret_state(bridge.get('api_key'))}")
    scraper = str(cfg.get("google_maps_scraper", ""))
    add(checks, "config.scraper_download", "info",
        "archive URL is pinned to a release tag" if "/archive/refs/tags/" in scraper else "scraper download is not pinned to a release tag")
    magick = str(cfg.get("imagemagick_path", ""))
    add(checks, "config.imagemagick_path", "info",
        "path exists" if magick and Path(magick).exists() else "path unset, a placeholder, or missing")


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
    parser = argparse.ArgumentParser(description="Offline MoneyPrinterV2 host and checkout preflight")
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
