#!/usr/bin/env python3
"""Offline, read-only Harness² host and checkout preflight.

Never runs harness2, uv, npm, docker, gcloud, a model, or the network.  It only
inspects PATH entries, process-environment *presence* (never values), and
public files of an optional local checkout.
"""
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
from pathlib import Path, PurePosixPath
from typing import Any

SKILL = "harness2"
EXPECTED_SHA = re.compile(r"[0-9a-fA-F]{40}\Z")
MAX_MARKER_BYTES = 1024 * 1024
BENCHES = ("demo", "method", "lab", "jb", "wb")
SUBSTRATES = ("oc", "cx")
# Public files tracked at the audited upstream commit.
STRUCTURE = (
    "pyproject.toml",
    "LICENSE",
    "harness2/cli/run_sweep.py",
    "harness2/core/recursion.py",
    "harness2/demo.py",
    "docs/SETUP.md",
    "dependencies/PINNED.md",
)
BENCH_DEPENDENCY_DIRS = {"lab": "harvey-labs", "jb": "job-bench-eval", "wb": "workbuddy-bench"}
# (tool, reason) per selected surface; `uv` covers the Python 3.12 venv itself.
TOOLS: dict[str, tuple[tuple[str, str], ...]] = {
    "demo": (("uv", "creates the Python 3.12 environment and installs the package"),),
    # Method mode applies Propose-Probe-Compose by hand: no checkout, install, or tool.
    "method": (),
    "lab": (
        ("uv", "harness2 venv plus `uv sync --locked` for the LAB environment"),
        ("node", "Node.js 20+ for the pinned OpenCode executor"),
        ("npm", "installs pinned Bun (and Codex for --substrate cx)"),
        ("pandoc", "LAB document conversion (upstream preflight.py requires it)"),
        ("pdftoppm", "Poppler; upstream preflight.py requires pdftoppm for LAB"),
    ),
    "jb": (
        ("uv", "harness2 venv plus `uv sync --locked` for JobBench"),
        ("node", "Node.js 20+ for the pinned OpenCode executor"),
        ("npm", "installs pinned Bun (and Codex for --substrate cx)"),
    ),
    "wb": (
        ("uv", "harness2 venv plus `uv sync --locked` for WorkBuddy"),
        ("node", "Node.js 20+ for the pinned OpenCode executor"),
        ("npm", "installs pinned Bun (and Codex for --substrate cx)"),
        ("docker", "WorkBuddy runs every rollout in a fresh container"),
        ("curl", "patched WorkBuddy dataset fetcher"),
    ),
}
MODEL_ENV = ("HARNESS2_SOLVER_MODEL", "HARNESS2_JUDGE_MODEL", "GOOGLE_CLOUD_PROJECT")
CODEX_ENV = ("HARNESS2_CODEX_BASE_URL",)
# Upstream probes `gcloud auth application-default print-access-token` only when a
# google-vertex solver/improver is set, or a claude/gemini judge (always for wb).
VERTEX_TOOL = ("gcloud", "Vertex Application Default Credentials probe run by harness2-check")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="preflight.py",
        description=(
            "Inspect safe host facts and an optional local Harness² checkout; never runs "
            "harness2, setup, a model, Docker, or the network."
        ),
        add_help=False,
        exit_on_error=False,
    )
    p.add_argument("-h", "--help", action="store_true", help="show this help and exit")
    p.add_argument("--json", action="store_true", help="emit one JSON object")
    p.add_argument("--bench", choices=BENCHES, default="demo",
                   help="surface to check: demo (default, no credentials) | method (manual mode, "
                        "no install) | lab | jb | wb")
    p.add_argument("--substrate", choices=SUBSTRATES, default=None,
                   help="benchmark executor: oc (OpenCode, default) | cx (Codex); not valid with demo")
    p.add_argument("--repo", metavar="PATH", help="optional local harness2 checkout")
    p.add_argument("--expect-commit", metavar="FULL_SHA",
                   help="expected 40-hex checkout commit (requires --repo)")
    return p


def check(name: str, status: str, detail: str, **extra: Any) -> dict[str, Any]:
    item: dict[str, Any] = {"name": name, "status": status, "detail": detail}
    item.update(extra)
    return item


def result(status: str, checks: list[dict[str, Any]]) -> dict[str, Any]:
    return {"skill": SKILL, "scope": "offline-preflight", "status": status,
            "checks": checks, "runtime_verified": False}


def parse(argv: list[str]) -> tuple[argparse.Namespace | None, str | None]:
    p = parser()
    if "--help" in argv or "-h" in argv:
        p.print_help()
        return None, None
    try:
        return p.parse_args(argv), None
    except (argparse.ArgumentError, SystemExit) as exc:
        return None, str(exc) or "invalid arguments"


def emit_error(message: str, as_json: bool) -> int:
    payload = result("error", [check("input", "blocked", message)])
    if as_json:
        print(json.dumps(payload, sort_keys=True))
    else:
        print(f"harness2 offline preflight: error\n- input: {message}")
    return 2


def public_file(root: Path, relative: str) -> tuple[str, str]:
    """lstat each component inside the checkout; never follow links or read content."""
    current = root
    info: os.stat_result | None = None
    for part in PurePosixPath(relative).parts:
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            return "blocked", f"missing public file: {relative}"
        except OSError as exc:
            return "blocked", f"cannot inspect {relative}: {type(exc).__name__}"
        if stat.S_ISLNK(info.st_mode):
            return "blocked", f"symlinked public path rejected: {relative}"
    assert info is not None
    if not stat.S_ISREG(info.st_mode):
        return "blocked", f"public path is not a regular file: {relative}"
    if info.st_size > MAX_MARKER_BYTES:
        return "blocked", f"public file exceeds {MAX_MARKER_BYTES} bytes: {relative}"
    return "ok", f"regular file present: {relative}"


def bounded_git(repo: Path) -> tuple[list[str] | None, str | None]:
    git_bin = shutil.which("git")
    if git_bin is None:
        return None, "git is unavailable; commit cannot be inspected"
    allowed = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    try:
        proc = subprocess.run(
            [git_bin, "-C", str(repo), "rev-parse", "--show-toplevel", "HEAD"],
            capture_output=True, text=True, check=False, timeout=5, env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, f"bounded git rev-parse failed: {type(exc).__name__}"
    lines = proc.stdout.splitlines()
    if proc.returncode != 0 or len(lines) != 2:
        return None, "bounded git rev-parse did not return root and full commit"
    return lines, None


def inspect_repo(repo_arg: str, expected: str | None, bench: str, checks: list[dict[str, Any]]) -> None:
    repo = Path(os.path.abspath(Path(repo_arg).expanduser()))
    try:
        info = os.lstat(repo)
    except FileNotFoundError:
        checks.append(check("repo", "blocked", "supplied --repo does not exist", path=str(repo)))
        return
    except OSError as exc:
        checks.append(check("repo", "blocked", f"cannot inspect --repo: {type(exc).__name__}", path=str(repo)))
        return
    if stat.S_ISLNK(info.st_mode):
        checks.append(check("repo", "blocked", "symlinked --repo path rejected", path=str(repo)))
        return
    if not stat.S_ISDIR(info.st_mode):
        checks.append(check("repo", "blocked", "supplied --repo is not a directory", path=str(repo)))
        return
    checks.append(check("repo", "ok", "supplied checkout directory exists", path=str(repo)))
    marker = repo / ".git"
    has_git = os.path.lexists(marker)
    checks.append(check("repo_git", "ok" if has_git else "blocked",
                        "checkout has a .git marker" if has_git else "checkout has no .git marker"))
    for relative in STRUCTURE:
        status, detail = public_file(repo, relative)
        checks.append(check(f"repo.structure:{relative}", status, detail))
    # Presence only: .env may hold credentials, so it is never opened.
    checks.append(check("repo_dotenv", "info",
                        ".env present (contents not read)" if os.path.lexists(repo / ".env")
                        else ".env absent; the pinned commit ships no .env.example, so create it from docs/SETUP.md settings",
                        present=os.path.lexists(repo / ".env")))
    if bench in BENCH_DEPENDENCY_DIRS:
        installed = os.path.lexists(repo / "dependencies" / BENCH_DEPENDENCY_DIRS[bench] / ".git")
        checks.append(check("repo_benchmark_install", "info",
                            "pinned benchmark checkout present under dependencies/" if installed
                            else "benchmark not set up yet; harness2-setup is approval-gated",
                            bench=bench, present=installed))
    lines, error = bounded_git(repo)
    if lines is None:
        checks.append(check("repo_commit", "blocked", error or "commit unavailable"))
        return
    observed_root, observed = lines
    try:
        root_matches = Path(observed_root).resolve() == repo.resolve()
    except OSError:
        root_matches = False
    if not root_matches:
        checks.append(check("repo_root", "blocked", "git show-toplevel does not match supplied checkout",
                            observed=observed_root, expected=str(repo.resolve())))
        return
    if not EXPECTED_SHA.fullmatch(observed):
        checks.append(check("repo_commit", "blocked", "bounded git rev-parse did not return a full commit"))
        return
    if expected is None:
        checks.append(check("repo_commit", "ok", "observed checkout commit; no comparison requested", observed=observed))
    else:
        matches = observed.lower() == expected.lower()
        checks.append(check("repo_commit", "ok" if matches else "blocked",
                            "checkout commit matches --expect-commit" if matches
                            else "checkout commit mismatches --expect-commit",
                            observed=observed, expected=expected))


def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    wants_json = "--json" in raw
    args, error = parse(raw)
    if args is None and error is None:
        return 0
    if error is not None:
        return emit_error(error, wants_json)
    assert args is not None
    if args.expect_commit is not None and args.repo is None:
        return emit_error("--expect-commit requires --repo", args.json)
    if args.expect_commit is not None and not EXPECTED_SHA.fullmatch(args.expect_commit):
        return emit_error("--expect-commit must be exactly 40 hexadecimal characters", args.json)
    if args.bench in {"demo", "method"} and args.substrate is not None:
        return emit_error(f"--substrate applies to lab, jb, or wb, not {args.bench}", args.json)
    substrate = args.substrate or "oc"

    checks: list[dict[str, Any]] = []
    os_name = platform.system() or "unknown"
    checks.append(check("host", "ok", "host facts observed without starting harness2",
                        os=os_name, arch=platform.machine() or "unknown"))
    py = sys.version_info
    checks.append(check("helper_python", "ok" if (py.major, py.minor) >= (3, 10) else "blocked",
                        f"helper runs on Python {py.major}.{py.minor}; harness2 itself needs 3.12-3.13 (uv can provision it)"))
    found = [name for name in ("python3.12", "python3.13") if shutil.which(name)]
    checks.append(check("harness2_python", "info",
                        "discoverable: " + ", ".join(found) if found
                        else "no python3.12/3.13 on PATH; `uv venv --python 3.12` may download CPython from astral.sh (network)"))
    if args.bench == "method":
        checks.append(check("platform", "info", "method mode needs no harness2 checkout, install, credentials, or tool", os=os_name))
    elif args.bench == "demo":
        checks.append(check("platform", "info", "local demo needs no model credentials; upstream documents Linux, demo was observed on macOS arm64 at the pin", os=os_name))
    elif os_name == "Linux":
        checks.append(check("platform", "ok", "Linux is the documented benchmark host", os=os_name))
    else:
        checks.append(check("platform", "warn", "benchmark runs are documented for Linux only; this host is unverified", os=os_name))
    for tool, reason in TOOLS[args.bench]:
        path = shutil.which(tool)
        checks.append(check(f"tool:{tool}", "ok" if path else "blocked",
                            f"discoverable, not executed; {reason}" if path else f"not on PATH; {reason}",
                            path=path))
    if args.bench not in {"demo", "method"}:
        # Model IDs are configuration, not secrets; .env is never opened, so unknown stays a warning.
        solver = os.environ.get("HARNESS2_SOLVER_MODEL", "")
        improver = os.environ.get("HARNESS2_IMPROVER_MODEL", "") or solver
        judge = os.environ.get("HARNESS2_JUDGE_MODEL", "")
        known_vertex = (args.bench == "wb" or solver.startswith("google-vertex")
                        or improver.startswith("google-vertex") or judge.startswith(("claude", "gemini")))
        tool, reason = VERTEX_TOOL
        path = shutil.which(tool)
        if path:
            status, detail = "ok", f"discoverable, not executed; {reason}"
        elif known_vertex:
            status, detail = "blocked", f"not on PATH; required for this Vertex configuration ({reason})"
        else:
            status, detail = "warn", ("not on PATH; required whenever a google-vertex executor/improver or a "
                                      "claude/gemini judge is configured (the documented default)")
        checks.append(check(f"tool:{tool}", status, detail, path=path))
    if args.bench != "method":
        vcs = shutil.which("git")
        checks.append(check("tool:vcs", "ok" if vcs else "blocked",
                            "version-control binary discoverable, not executed" if vcs
                            else "version-control binary not on PATH; needed to clone and for setup's pinned fetches",
                            path=vcs))
    if args.bench not in {"demo", "method"}:
        for key in MODEL_ENV + (CODEX_ENV if substrate == "cx" else ()):
            checks.append(check(f"env:{key}", "info",
                                "set in this process (value not read)" if os.environ.get(key)
                                else "unset in this process; may be supplied by .env",
                                present=bool(os.environ.get(key))))
        checks.append(check("substrate", "ok", f"executor {substrate}", substrate=substrate))
    checks.append(check("cost_boundary", "info",
                        "ok status only means offline checks passed: no setup, model, judge, Docker, bridge, "
                        "or network action ran; each benchmark task costs about 4k executor rollouts and 3k "
                        "improver sessions and needs separate approval"))
    if args.repo is not None:
        inspect_repo(args.repo, args.expect_commit, args.bench, checks)

    blocked = any(item["status"] == "blocked" for item in checks)
    overall = "blocked" if blocked else "ok"
    payload = result(overall, checks)
    if args.json:
        print(json.dumps(payload, sort_keys=True))
    else:
        print(f"harness2 offline preflight ({args.bench}): {overall}")
        for item in checks:
            if item["status"] not in {"info"}:
                print(f"- {item['name']}: [{item['status']}] {item['detail']}")
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
