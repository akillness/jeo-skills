#!/usr/bin/env python3
"""Offline inventory and environment check for kagent; never executes binaries or accesses network."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}
REPO_KEY_FILES = ("README.md", "LICENSE", "Makefile", "AGENTS.md")


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


def check_repo_files(repo_path: Path) -> tuple[bool, list[str]]:
    missing = []
    for rel_path in REPO_KEY_FILES:
        target = repo_path / rel_path
        if not target.is_file():
            missing.append(rel_path)
    return len(missing) == 0, missing


def find_scoped_binary(name: str) -> str | None:
    # First check standard PATH
    which_path = shutil.which(name)
    if which_path:
        return which_path

    # Check common user bin locations
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


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Inspect kagent executables and offline environment without executing code or calling networks."
    )
    parser.add_argument("--json", action="store_true", help="Emit report as formatted JSON")
    parser.add_argument("--repo", type=str, default=None, help="Inspect a local kagent source repository checkout")

    try:
        args = parser.parse_args()
    except SystemExit:
        return 2

    repo_verified = False
    missing_files: list[str] = []
    exit_code = 0

    if args.repo is not None:
        try:
            repo_path = validate_repo_path(args.repo)
            ok, missing_files = check_repo_files(repo_path)
            if ok:
                repo_verified = True
            else:
                repo_verified = False
                exit_code = 1
        except PreflightError as err:
            if args.json:
                print(json.dumps({"error": err.message, "exit_code": err.exit_code}))
            else:
                print(f"Error: {err.message}", file=sys.stderr)
            return err.exit_code

    report = {
        "kagent": find_scoped_binary("kagent"),
        "kubectl": find_scoped_binary("kubectl"),
        "helm": find_scoped_binary("helm"),
        "docker": find_scoped_binary("docker"),
        "network_used": False,
        "binaries_executed": False,
        "credentials_read": False,
        "repo_verified": repo_verified,
        "missing_repo_files": missing_files,
    }

    if args.json or True:  # Default to JSON output for tooling
        print(json.dumps(report, indent=2, sort_keys=True))

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
