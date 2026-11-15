#!/usr/bin/env python3
"""Offline inventory and environment check for FastMCP; never executes binaries or accesses network."""

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
FASTMCP_KEY_PACKAGES = (
    "fastmcp",
    "fastmcp_slim",
    "fastmcp_remote",
    "mcp",
    "pydantic",
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


def inspect_packages() -> dict[str, bool]:
    results = {}
    for pkg in FASTMCP_KEY_PACKAGES:
        try:
            spec = importlib.util.find_spec(pkg)
            results[pkg] = spec is not None
        except (ImportError, AttributeError, ValueError):
            results[pkg] = False
    return results


def inspect_repo(repo_path: Path) -> dict[str, bool]:
    required_indicators = {
        "pyproject.toml": (repo_path / "pyproject.toml").is_file(),
        "README.md": (repo_path / "README.md").is_file(),
        "fastmcp_slim": (repo_path / "fastmcp_slim").is_dir() or (repo_path / "src" / "fastmcp").is_dir(),
    }
    return required_indicators


def run_preflight(repo_arg: str | None = None) -> tuple[dict, int]:
    binary_path = find_scoped_binary("fastmcp")
    packages = inspect_packages()

    repo_report = None
    exit_code = 0

    if repo_arg:
        try:
            repo_path = validate_repo_path(repo_arg)
            repo_indicators = inspect_repo(repo_path)
            all_present = all(repo_indicators.values())
            repo_report = {
                "path": str(repo_path),
                "indicators": repo_indicators,
                "valid": all_present,
            }
            if not all_present:
                exit_code = 1
        except PreflightError as err:
            return {"status": "error", "message": err.message, "runtime_verified": False}, err.exit_code

    is_installed = bool(binary_path or packages.get("fastmcp") or packages.get("fastmcp_slim"))
    report = {
        "status": "pass" if exit_code == 0 else "warn",
        "fastmcp_installed": is_installed,
        "binary": binary_path,
        "packages": packages,
        "repo_check": repo_report,
        "runtime_verified": False,
    }
    return report, exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline FastMCP environment preflight check.")
    parser.add_argument("--repo", help="Optional absolute path to local FastMCP source checkout.")
    parser.add_argument("--json", action="store_true", help="Output results as JSON.")
    args = parser.parse_args()

    report, exit_code = run_preflight(args.repo)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        status_label = report.get("status", "unknown").upper()
        print(f"FastMCP Preflight [{status_label}] (runtime_verified=False)")
        print(f"  CLI binary: {report.get('binary') or 'not found (informational)'}")
        pkgs = report.get("packages", {})
        print(f"  Packages found: {', '.join(k for k, v in pkgs.items() if v) or 'none'}")
        if report.get("repo_check"):
            rc = report["repo_check"]
            print(f"  Repo check: {rc['path']} (valid={rc['valid']})")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
