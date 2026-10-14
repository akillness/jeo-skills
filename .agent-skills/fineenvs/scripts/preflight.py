#!/usr/bin/env python3
from __future__ import annotations
import os
import argparse
import importlib.metadata as metadata
import json
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

FRAMEWORKS = {
    "openenv": ("openenv",), "ors": ("ors", "openreward"),
    "nemo-gym": ("nemo-gym", "nemo_gym"), "verifiers": ("verifiers",),
    "skyrl-gym": ("skyrl", "skyrl-gym"), "gem": ("gem",),
}
ENVIRONMENTS = ("jupyter", "wordle", "desktop")
PROJECTS = ("01-latex-ocr", "02-watercolour", "03-geoguesser", "04-smoldataenvs", "05-multi-harness-rl", "07-simulation-environments")
REQUIRED_FILES = ("README.md", "LICENSE", "00-environments-101/README.md", "00-environments-101/project.yaml")
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")

def add(checks: list[dict[str, object]], name: str, status: str, details: str, required: bool = False) -> None:
    checks.append({"name": name, "status": status, "required": required, "details": details})

def package_version(distributions: tuple[str, ...]) -> str | None:
    for distribution in distributions:
        try:
            return metadata.version(distribution)
        except metadata.PackageNotFoundError:
            pass
        except Exception:
            return "unavailable"
    return None

def git_head(repo: Path) -> tuple[str | None, str | None]:
    git = shutil.which("git")
    if not git:
        return None, "git-not-found"
    host_keys = ("PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR")
    env = {key: os.environ[key] for key in host_keys if key in os.environ}
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_ALLOW_PROTOCOL": ""})
    try:
        result = subprocess.run([git, "-C", str(repo), "rev-parse", "--show-toplevel", "HEAD"], env=env,
                                check=False, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError) as exc:
        return None, type(exc).__name__
    if result.returncode:
        return None, "not-a-git-checkout"
    lines = result.stdout.splitlines()
    if len(lines) != 2 or Path(lines[0]).resolve() != repo.resolve():
        return None, "git-root-mismatch"
    head = lines[1].strip()
    return (head, None) if SHA_RE.fullmatch(head) else (None, "invalid-git-output")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect FineEnvs prerequisites without network or execution.")
    parser.add_argument("--json", action="store_true", help="emit one JSON object")
    parser.add_argument("--repo", type=Path, help="existing FineEnvs checkout to inspect")
    parser.add_argument("--expect-commit", help="full 40-hex checkout commit; requires --repo")
    return parser.parse_args()


def invalid_payload(message: str) -> dict[str, object]:
    return {"skill": "fineenvs", "scope": "offline-preflight", "status": "error",
            "checks": [{"name": "arguments", "status": "error", "required": True, "details": message}],
            "runtime_verified": False}


def run(args: argparse.Namespace) -> tuple[dict[str, object], int]:
    checks: list[dict[str, object]] = []
    if args.expect_commit is not None and (not args.repo or not SHA_RE.fullmatch(args.expect_commit)):
        return invalid_payload("--expect-commit requires --repo and a full 40-hex SHA"), 2
    version = ".".join(str(part) for part in sys.version_info[:3])
    add(checks, "python", "ok" if sys.version_info >= (3, 11) else "mismatch", f"{version} ({sys.executable})", True)
    add(checks, "host", "ok", f"{platform.system()} {platform.machine()}")
    for tool in ("uv", "git"):
        path = shutil.which(tool)
        add(checks, f"tool:{tool}", "ok" if path else "missing", path or f"{tool} not found on PATH", True)
    for name, distributions in FRAMEWORKS.items():
        found = package_version(distributions)
        add(checks, f"framework:{name}", "missing" if found is None else "unknown" if found == "unavailable" else "present",
            "optional distribution metadata not installed" if found is None else "distribution metadata could not be read" if found == "unavailable" else f"distribution metadata version {found}")

    repo = args.repo.expanduser() if args.repo else None
    if repo is not None:
        if not repo.exists() or not repo.is_dir():
            add(checks, "repo", "missing", f"checkout directory not found: {repo}", True)
        else:
            add(checks, "repo", "ok", str(repo), True)
            for relative in REQUIRED_FILES:
                path = repo / relative
                add(checks, f"structure:{relative}", "ok" if path.is_file() else "missing", "required source marker", True)
            present_projects = 0
            for relative in PROJECTS:
                present = (repo / relative).is_dir()
                present_projects += int(present)
                add(checks, f"project:{relative}", "present" if present else "missing", "optional audited project tree")
            add(checks, "project-structure", "ok" if present_projects else "missing",
                f"{present_projects} audited project tree(s) present; partial check is allowed", True)
            head, error = git_head(repo)
            if head:
                matched = not args.expect_commit or head.lower() == args.expect_commit.lower()
                detail = head if not args.expect_commit else f"{head} (expected {args.expect_commit})"
                add(checks, "git-head", "ok" if matched else "mismatch", detail, True)
            else:
                add(checks, "git-head", "missing", error or "unable to read checkout HEAD", True)
            for name in FRAMEWORKS:
                candidates = (repo / "00-environments-101" / "envs" / env / variant
                              for env in ENVIRONMENTS for variant in (name, name.replace("-", "_")))
                add(checks, f"source-framework:{name}", "present" if any(path.exists() for path in candidates) else "not-present",
                    "optional dialect tree")
            install_script = repo / "05-multi-harness-rl" / "jobs" / "install.sh"
            add(checks, "source-branch:multi-harness", "declared" if install_script.is_file() else "not-selected",
                "uses TRL/OpenEnv/Transformers upstream main when this project is selected")
            nemo = any(item["name"] == "source-framework:nemo-gym" and item["status"] == "present" for item in checks)
            add(checks, "source-branch:nemo-gym", "declared" if nemo else "not-selected",
                "requires git+https://github.com/NVIDIA-NeMo/Gym and Python 3.12+ when selected")

    passing = {"ok", "present", "declared"}
    failed = [item for item in checks if item["required"] and item["status"] not in passing]
    status = "blocked" if failed else "ok"
    payload: dict[str, object] = {"skill": "fineenvs", "scope": "offline-preflight", "status": status,
                                  "checks": checks, "runtime_verified": False}
    if repo is not None:
        payload["repo"] = str(repo)
    return payload, 1 if failed else 0


def main() -> int:
    args = argparse.Namespace(json=False)
    try:
        args = parse_args()
        payload, code = run(args)
    except SystemExit as exc:
        if exc.code == 0:
            raise
        args = argparse.Namespace(json="--json" in sys.argv[1:])
        payload, code = invalid_payload("invalid command-line arguments"), 2
    except Exception as exc:
        payload, code = {"skill": "fineenvs", "scope": "offline-preflight", "status": "error",
                         "checks": [{"name": "preflight", "status": "error", "required": True, "details": type(exc).__name__}],
                         "runtime_verified": False}, 2
    if args.json:
        print(json.dumps(payload, sort_keys=True))
        return code
    checks = payload.get("checks", [])
    failures = sum(1 for item in checks if item.get("required") and item.get("status") not in {"ok", "present", "declared"})
    print(f"fineenvs offline-preflight: {payload.get('status', 'error')} ({failures} required check failure(s))")
    for item in checks:
        if item.get("required") and item.get("status") not in {"ok", "present", "declared"}:
            print(f"- {item['name']}: {item['details']}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
