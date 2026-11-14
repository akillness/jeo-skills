#!/usr/bin/env python3
"""Offline inventory and environment check for TruLens; never executes binaries or accesses network."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}
TRULENS_KEY_PACKAGES = (
    "trulens",
    "trulens_core",
    "trulens_eval",
    "trulens.core",
    "trulens.apps.langchain",
    "trulens.apps.llamaindex",
    "trulens.providers.openai",
    "trulens.providers.cortex",
    "trulens.dashboard",
)


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code


def validate_repo_path(repo_arg: str) -> Path:
    if not repo_arg:
        raise PreflightError("empty repo path", exit_code=2)
    path = Path(repo_arg)
    if not path.is_absolute():
        raise PreflightError("repo path must be absolute", exit_code=2)
    posix = PurePosixPath(path.as_posix())
    for part in posix.parts:
        lower = part.lower()
        if lower in BLOCKED_PARTS or lower in SENSITIVE_STEMS or lower.startswith(".env"):
            raise PreflightError(f"sensitive path component not allowed: {part}", exit_code=2)
    if not path.exists() or not path.is_dir():
        raise PreflightError("repo directory not found or not a directory", exit_code=2)
    return path


def find_scoped_binary(name: str) -> str | None:
    which_path = shutil.which(name)
    if which_path:
        return which_path

    home = Path.home()
    candidates = [
        home / ".local" / "bin" / name,
        home / "bin" / name,
        Path("/usr/local/bin") / name,
        Path("/opt/homebrew/bin") / name,
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def check_python_packages() -> dict[str, bool]:
    results = {}
    for pkg in TRULENS_KEY_PACKAGES:
        try:
            spec = importlib.util.find_spec(pkg)
            results[pkg] = spec is not None
        except (ImportError, AttributeError, ValueError):
            results[pkg] = False
    return results


def check_local_databases(cwd_path: Path) -> list[str]:
    found = []
    candidates = ["default.sqlite", "trulens.sqlite", "evaluations.sqlite"]
    for cand in candidates:
        db_path = cwd_path / cand
        if db_path.is_file():
            found.append(cand)
    return found


def run_preflight(repo_dir: str | None = None) -> dict:
    cwd_path = Path.cwd().resolve()
    target_repo = None
    if repo_dir:
        target_repo = str(validate_repo_path(repo_dir))

    trulens_cli = find_scoped_binary("trulens")
    python_cli = sys.executable
    pkg_status = check_python_packages()
    local_dbs = check_local_databases(cwd_path)

    any_pkg_found = any(pkg_status.values())
    cli_found = trulens_cli is not None

    ready = cli_found or any_pkg_found

    return {
        "status": "ready" if ready else "missing_dependencies",
        "cli": {
            "trulens": trulens_cli,
            "python": python_cli,
        },
        "python_packages": pkg_status,
        "local_databases": local_dbs,
        "working_directory": str(cwd_path),
        "target_repo": target_repo,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-dir", help="Optional absolute repository directory to validate")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    try:
        data = run_preflight(args.repo_dir)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"status": "error", "message": exc.message}))
        else:
            print(f"Error: {exc.message}", file=sys.stderr)
        return exc.exit_code
    except Exception as exc:
        if args.json:
            print(json.dumps({"status": "error", "message": str(exc)}))
        else:
            print(f"Unexpected error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(f"TruLens Preflight Status: {data['status']}")
        print(f"  CLI trulens: {data['cli']['trulens'] or 'not found'}")
        print(f"  Python executable: {data['cli']['python']}")
        installed_pkgs = [p for p, found in data["python_packages"].items() if found]
        print(f"  Installed packages: {', '.join(installed_pkgs) if installed_pkgs else 'none detected'}")
        if data["local_databases"]:
            print(f"  Local SQLite DBs: {', '.join(data['local_databases'])}")

    return 0 if data["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
