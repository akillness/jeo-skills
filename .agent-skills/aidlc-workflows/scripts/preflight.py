#!/usr/bin/env python3
"""Offline AI-DLC workflows host and source-checkout preflight.

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

SKILL = "aidlc-workflows"
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
    ("git", "info", "needed only to read a checkout's identity with --repo; the installer and `aidlc config` do not use it"),
    ("aidlc", "info", "install it first; a command that is found is never executed here, so its version stays unverified"),
    ("gh", "info", "optional: with a compatible GitHub CLI the installer also verifies signed provenance; checksums are verified either way"),
    ("claude", "info", "needed only for Claude Code (`--harness claude`)"),
    ("kiro-cli", "info", "needed only for Kiro; its harness ids changed after v2.11.3, so read `aidlc config --help` for the installed release"),
    ("codex", "info", "needed only for Codex CLI (`--harness codex`, invoked with `$aidlc`)"),
    ("opencode", "info", "needed only for opencode (`--harness opencode`)"),
    ("copilot", "info", "needed only for GitHub Copilot CLI (`--harness copilot`)"),
    ("agent", "info", "needed only for Cursor's CLI (`--harness cursor`)"),
)

PROBES = (
    {"name": "claude-preapproval", "path": "harness/claude/settings.json", "pattern": r'"Edit\(/\*\*\)"',
     "hit": "the shipped Claude settings pre-approve Edit(/**) plus the aidlc Bash commands, Task and WebSearch, so edits inside the project need no prompt",
     "miss": "the shipped Claude settings no longer pre-approve Edit(/**); read harness/claude/settings.json for the current permissions"},
    {"name": "claude-hooks", "path": "harness/claude/settings.json", "pattern": r'"command":\s*"bun ', "more_than": 8,
     "hit": "the shipped Claude settings register more than eight hook commands that run `bun .../aidlc.ts engine hook ...` (the copy channel; a native install runs `aidlc`)",
     "miss": "the shipped Claude settings register eight or fewer `bun ... engine hook` commands; the hook set differs from the audit"},
    {"name": "claude-mcp-unpinned", "path": "harness/claude/.mcp.json", "pattern": r"@latest",
     "hit": "the optional shipped Claude MCP entries start AWS servers through `uvx ...@latest`, which runs whatever PyPI currently publishes each time",
     "miss": "the shipped Claude MCP entries no longer use `@latest`; read harness/claude/.mcp.json"},
    {"name": "readme-pipe-install", "path": "README.md", "pattern": r"install\.sh \| sh",
     "hit": "the README quick start pipes the release installer straight into sh; the install guide documents a download-first path and signed provenance",
     "miss": "the README no longer pipes the installer into sh"},
    {"name": "provenance-optional", "path": "docs/guide/18-install-and-lifecycle.md", "pattern": r"provenance\s+verification is skipped",
     "hit": "provenance verification is skipped when no compatible GitHub CLI is found; checksum verification stays mandatory",
     "miss": "the install guide no longer says provenance verification is skipped without a compatible GitHub CLI"},
    {"name": "no-os-signing", "path": "docs/guide/18-install-and-lifecycle.md", "pattern": r"code-signing and\s+notarization are not part",
     "hit": "the release has no OS code-signing or notarization; trust rests on TLS, SHA-256 and optional attestation",
     "miss": "the install guide no longer says OS code-signing and notarization are absent"},
    {"name": "kiro-harness-ids", "path": "README.md", "pattern": r"--harness kiro-ide",
     "hit": "this release calls Kiro's v3 harness `kiro-ide` and Kiro CLI (V2) `kiro`; later main renamed them to `kiro` and `kiro-v2`",
     "miss": "the Kiro harness ids differ from the audited release (`kiro-ide` for v3, `kiro` for Kiro CLI V2); run `aidlc config --help` for the installed release"},
)

SUPPORTED = {
    "Darwin": {"x86_64", "arm64"},
    "Linux": {"x86_64", "amd64", "aarch64", "arm64"},
    "Windows": {"amd64", "x86_64", "x64"},
}
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:-preview\.\d{8}\.\d+)?$")
INSTALL_ENV = ("AIDLC_RELEASE_BASE_URL", "AIDLC_RELEASE_REPOSITORY", "AIDLC_RELEASE_WORKFLOW", "AIDLC_CA_BUNDLE",
               "AIDLC_GH_BIN", "AIDLC_INSTALL_ROOT", "AIDLC_BIN_DIR", "AIDLC_ALLOW_ROOT", "AIDLC_OFFLINE",
               "AWS_AIDLC_DEFAULT_SCOPE")
TRUST_ENV = ("AIDLC_RELEASE_BASE_URL", "AIDLC_RELEASE_REPOSITORY", "AIDLC_RELEASE_WORKFLOW", "AIDLC_CA_BUNDLE", "AIDLC_GH_BIN")
BYPASS_PREFIXES = ("AIDLC_SKIP_", "AIDLC_DISABLE_")
BEDROCK_NAMES = ("CLAUDE_CODE_USE_BEDROCK", "AWS_PROFILE", "AWS_REGION")
MAX_LIST = 20
MUSL_DIRS = ("/lib", "/usr/lib")


def register_args(parser):
    parser.add_argument("--project", help="inspect a project's AI-DLC files (names, counts and pins only; secrets and header values are never read out)")


def data_root():
    if platform.system() == "Windows":
        base = os.environ.get("LOCALAPPDATA")
        return Path(base) / "aidlc" if base else None
    base = os.environ.get("XDG_DATA_HOME")
    if base and os.path.isabs(base):
        return Path(base) / "aidlc"
    return Path.home() / ".local" / "share" / "aidlc"


def installed_versions(root):
    versions = []
    try:
        for entry in os.scandir(root / "versions"):
            if entry.is_dir(follow_symlinks=False) and VERSION_RE.fullmatch(entry.name):
                versions.append(entry.name)
    except OSError:
        return None
    return sorted(versions)[:MAX_LIST]


def platform_checks(checks):
    system, machine = platform.system(), platform.machine().lower()
    if machine not in SUPPORTED.get(system, set()):
        add(checks, "platform", "blocked",
            f"{system or 'unknown OS'} {machine or 'unknown arch'} has no release binary; assets cover macOS x64/arm64, Linux x64/arm64 (glibc and musl) and Windows x64")
        return
    add(checks, "platform", "ok", f"{system} {machine} is a supported release target")
    if system == "Linux":
        musl = any(True for base in MUSL_DIRS for _ in Path(base).glob("ld-musl-*"))
        if musl:
            add(checks, "libc", "info", "musl detected: the musl asset needs the system libgcc and libstdc++ (`apk add libgcc libstdc++` on Alpine); the installer never installs system packages")
        else:
            add(checks, "libc", "info", "no musl loader found; the glibc asset applies")


def installer_checks(checks):
    system = platform.system()
    if system == "Windows":
        add(checks, "installer", "info", "the PowerShell installer needs no curl, wget or checksum tool; run it from a normal (non-administrator) window")
        return
    hasher = shutil.which("sha256sum") or shutil.which("shasum")
    add(checks, "installer.hash-tool", "ok" if hasher else "blocked",
        f"checksum tool at {hasher}" if hasher else "neither sha256sum nor shasum is on PATH; every installer run, offline included, needs one")
    fetch = shutil.which("curl") or shutil.which("wget")
    add(checks, "installer.download-tool", "ok" if fetch else "blocked",
        f"download tool at {fetch}" if fetch else "neither curl nor wget is on PATH; an online install needs one (an offline install with --from does not)")
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        if os.environ.get("SUDO_USER"):
            add(checks, "installer.root", "blocked", "running under sudo: the installer refuses, and --allow-root is refused too; run it as your own user")
        else:
            add(checks, "installer.root", "info", "running as root: the installer refuses unless --allow-root (or AIDLC_ALLOW_ROOT=1), meant only for a container, CI job or agent sandbox where root is the only user")


def existing_install(checks):
    root = data_root()
    if root is None:
        add(checks, "install.existing", "info", "LOCALAPPDATA is unset, so the install root cannot be located")
        return
    versions = installed_versions(root)
    if versions is None:
        add(checks, "install.existing", "info", "no AI-DLC versions directory at the default location")
    else:
        add(checks, "install.existing", "info", f"installed versions (directory names only): {', '.join(versions) or 'none'}")
    found = shutil.which("aidlc")
    if found:
        default_bin = (Path(os.environ["LOCALAPPDATA"]) / "aidlc" / "bin") if platform.system() == "Windows" and os.environ.get("LOCALAPPDATA") else Path.home() / ".local" / "bin"
        if Path(found).parent != default_bin and not os.environ.get("AIDLC_BIN_DIR"):
            add(checks, "install.command", "info", f"`aidlc` resolves to {found}, outside the default {default_bin}; the installer yields to an existing Homebrew or Nix command and refuses a mixed-ownership one")


def env_checks(checks):
    env_report(checks, "env", INSTALL_ENV)
    changed = [key for key in TRUST_ENV if os.environ.get(key, "").strip()]
    if changed:
        add(checks, "env.trust-root", "info",
            "set: " + ", ".join(changed) + "; these change where the installer downloads from and which repository and signer workflow provenance trusts; confirm they are intended")
    bypass = sorted(key for key, value in os.environ.items() if key.startswith(BYPASS_PREFIXES) and value.strip())
    add(checks, "env.guard-bypass", "info",
        ("set in this shell: " + ", ".join(bypass) + "; each switches a guard or ceremony off here, and `aidlc config flags --show` lists the ones recorded for a project")
        if bypass else "no AIDLC_SKIP_* or AIDLC_DISABLE_* variable is set; values are never read out")


def load_json(root, rel):
    if not contained(root, rel):
        return None, "resolves outside the project"
    data, why = read_regular(root / rel, MAX_CONFIG_BYTES)
    if data is None:
        return None, why
    try:
        parsed = json.loads(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None, "not valid JSON"
    return parsed, ""


def claude_settings(checks, project):
    settings, why = load_json(project, ".claude/settings.json")
    if settings is None:
        if why != "missing":
            add(checks, "project.claude-settings", "info", f".claude/settings.json is not inspected ({why})")
        return
    if not isinstance(settings, dict):
        add(checks, "project.claude-settings", "info", ".claude/settings.json is not a JSON object")
        return
    permissions = settings.get("permissions") if isinstance(settings.get("permissions"), dict) else {}
    allow = [str(item)[:80] for item in permissions.get("allow", []) if isinstance(item, str)] if isinstance(permissions.get("allow"), list) else []
    broad = [item for item in allow if item.startswith(("Edit(", "Write(", "Bash("))][:8]
    hooks = settings.get("hooks") if isinstance(settings.get("hooks"), dict) else {}
    total = ours = 0
    for items in hooks.values():
        for item in items if isinstance(items, list) else []:
            for hook in item.get("hooks", []) if isinstance(item, dict) and isinstance(item.get("hooks"), list) else []:
                command = hook.get("command") if isinstance(hook, dict) else None
                if isinstance(command, str):
                    total += 1
                    ours += "aidlc" in command
    add(checks, "project.claude-hooks", "info",
        f"{total} hook command(s) across {len(hooks)} event(s), {ours} of them run aidlc; hooks run on your machine without a prompt each time")
    add(checks, "project.claude-permissions", "info",
        ("pre-approved without a prompt: " + "; ".join(broad)) if broad else "no Edit, Write or Bash permission is pre-approved in .claude/settings.json")


def claude_local(checks, project):
    local, why = load_json(project, ".claude/settings.local.json")
    if not isinstance(local, dict):
        return
    env = local.get("env") if isinstance(local.get("env"), dict) else {}
    present = [name for name in BEDROCK_NAMES if name in env]
    if present:
        add(checks, "project.bedrock-settings", "info", "settings.local.json sets " + ", ".join(present) + " (names only); it is yours and git ignores it")


def mcp_servers(checks, project, rel):
    config, why = load_json(project, rel)
    if config is None:
        if why != "missing":
            add(checks, "project.mcp:" + rel, "info", f"{rel} is not inspected ({why})")
        return
    servers = config.get("mcpServers") if isinstance(config, dict) and isinstance(config.get("mcpServers"), dict) else {}
    if not servers:
        add(checks, "project.mcp:" + rel, "info", f"{rel} registers no MCP servers")
        return
    unpinned, remote = [], []
    for name, spec in servers.items():
        if not isinstance(spec, dict):
            continue
        args = spec.get("args") if isinstance(spec.get("args"), list) else []
        if any(isinstance(arg, str) and arg.endswith("@latest") for arg in args):
            unpinned.append(name)
        url = spec.get("url")
        if isinstance(url, str):
            try:
                from urllib.parse import urlsplit
                host = urlsplit(url).hostname
            except ValueError:
                host = None
            remote.append(f"{name} ({host or 'unparsed host'})")
    names = ", ".join(sorted(str(name)[:40] for name in servers)[:MAX_LIST])
    add(checks, "project.mcp:" + rel, "info",
        f"{len(servers)} MCP server(s): {names}"
        + (f"; started through an unpinned `@latest` package: {', '.join(sorted(unpinned))}" if unpinned else "")
        + (f"; hosted endpoints (host only, header values never read): {', '.join(sorted(remote))}" if remote else ""))


def inspect_project(checks, args):
    project = Path(args.project)
    if not project.is_dir():
        add(checks, "project", "blocked", "--project is not a directory")
        return
    root = project.resolve()
    present = [name for name in ("aidlc", ".claude", ".kiro", ".codex", ".cursor", ".aidlc") if (root / name).is_dir() and not (root / name).is_symlink()]
    add(checks, "project", "ok", "AI-DLC-related directories present: " + (", ".join(present) if present else "none"))
    pin, why = read_regular(root / ".aidlc-version", 128)
    if pin is None:
        add(checks, "project.pin", "info", "no .aidlc-version pin" if why == "missing" else f".aidlc-version is not read ({why})")
    else:
        version = pin.decode("utf-8", "replace").strip()
        if VERSION_RE.fullmatch(version):
            installed = installed_versions(data_root()) if data_root() else None
            note = "" if installed is None or version in installed else "; that release is not installed on this machine, so `aidlc config --download` (or a yes at the prompt) would fetch it"
            add(checks, "project.pin", "info", f"project is pinned to AI-DLC {version}{note}")
        else:
            add(checks, "project.pin", "info", ".aidlc-version holds something other than a release id")
    claude_settings(checks, root)
    claude_local(checks, root)
    mcp_servers(checks, root, ".mcp.json")
    mcp_servers(checks, root, ".kiro/settings/mcp.json")


def host_checks(checks, args):
    py = sys.version_info
    add(checks, "python", "info", f"Python {py.major}.{py.minor}.{py.micro} runs this helper only; a native AI-DLC install needs no Python, Node.js or Bun")
    platform_checks(checks)
    installer_checks(checks)
    existing_install(checks)
    env_checks(checks)


def extras(checks, args):
    if args.project:
        inspect_project(checks, args)


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
    parser = argparse.ArgumentParser(description="Offline AI-DLC workflows host and checkout preflight")
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
