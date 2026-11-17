#!/usr/bin/env python3
"""Offline inventory, source-manifest detection, and configuration preflight helper for rust-anything; never makes network calls or spawns processes."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}

SOURCE_MANIFESTS = {
    "package.json": "TypeScript/JavaScript",
    "pyproject.toml": "Python",
    "requirements.txt": "Python",
    "setup.py": "Python",
    "go.mod": "Go",
    "Gemfile": "Ruby",
    "pom.xml": "Java",
    "build.gradle": "Java/Kotlin",
    "CMakeLists.txt": "C/C++",
    "Makefile": "C/C++/General",
    "Cargo.toml": "Rust",
}


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code


def validate_safe_path(raw_path: str, must_exist: bool = True, must_file: bool = False, must_dir: bool = False) -> Path:
    if not raw_path:
        raise PreflightError("empty path argument", exit_code=2)
    path = Path(raw_path)
    if not path.is_absolute():
        raise PreflightError("path must be absolute", exit_code=2)
    posix = PurePosixPath(path.as_posix())
    for part in posix.parts:
        lower = part.lower()
        if lower in BLOCKED_PARTS or lower in SENSITIVE_STEMS or lower.startswith(".env"):
            raise PreflightError(f"sensitive path component not allowed: {part}", exit_code=2)
    if must_exist and not path.exists():
        raise PreflightError(f"target path not found: {path}", exit_code=2)
    if must_file and not path.is_file():
        raise PreflightError(f"target path is not a regular file: {path}", exit_code=2)
    if must_dir and not path.is_dir():
        raise PreflightError(f"target path is not a directory: {path}", exit_code=2)
    return path


def find_scoped_binary(name: str) -> str | None:
    which_path = shutil.which(name)
    if which_path:
        return which_path

    home = Path.home()
    candidates = [
        home / ".cargo" / "bin" / name,
        home / ".local" / "bin" / name,
        home / "bin" / name,
        Path("/usr/local/bin") / name,
        Path("/opt/homebrew/bin") / name,
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def detect_manifests(workspace: Path) -> dict[str, str]:
    detected = {}
    for filename, lang in SOURCE_MANIFESTS.items():
        if (workspace / filename).is_file():
            detected[filename] = lang
    return detected


def count_fixtures(workspace: Path) -> dict:
    fixture_dirs = [
        workspace / "golden_fixtures",
        workspace / "fixtures",
        workspace / "tests" / "fixtures",
        workspace / "test" / "fixtures",
    ]
    total_fixtures = 0
    found_dirs = []
    for fdir in fixture_dirs:
        if fdir.is_dir():
            found_dirs.append(str(fdir.relative_to(workspace)))
            try:
                total_fixtures += len(list(fdir.glob("*.json")))
            except Exception:
                pass
    return {
        "fixture_directories": found_dirs,
        "recorded_json_fixtures_count": total_fixtures,
    }


def parse_rust_anything_config(cfg_path: Path) -> dict:
    try:
        content = cfg_path.read_text(encoding="utf-8")
    except Exception as err:
        raise PreflightError(f"unable to read configuration file: {err}", exit_code=1)

    # Basic key-value parser for simple TOML files without third-party dependencies
    has_source = "[source]" in content or "source_lang" in content or "source =" in content
    has_target = "[target]" in content or "target =" in content
    return {
        "valid": True,
        "path": str(cfg_path),
        "has_source_section": has_source,
        "has_target_section": has_target,
    }


def run_preflight(workspace_arg: str | None = None) -> dict:
    cargo_bin = find_scoped_binary("cargo")
    rustc_bin = find_scoped_binary("rustc")
    rust_anything_bin = find_scoped_binary("rust-anything")

    ws_info = None
    if workspace_arg:
        ws_path = validate_safe_path(workspace_arg, must_exist=True, must_dir=True)
        manifests = detect_manifests(ws_path)
        fixtures_info = count_fixtures(ws_path)

        cfg_file = ws_path / "rust-anything.toml"
        cfg_info = None
        if cfg_file.is_file():
            cfg_info = parse_rust_anything_config(cfg_file)

        ws_info = {
            "path": str(ws_path),
            "detected_manifests": manifests,
            "detected_languages": list(set(manifests.values())),
            "has_rust_target": "Cargo.toml" in manifests,
            "fixtures": fixtures_info,
            "configuration": cfg_info,
        }

    ready = (cargo_bin is not None and rustc_bin is not None) or rust_anything_bin is not None or (ws_info is not None and len(ws_info["detected_manifests"]) > 0)

    return {
        "status": "ready" if ready else "missing_toolchain",
        "cli": {
            "cargo": cargo_bin,
            "rustc": rustc_bin,
            "rust_anything": rust_anything_bin,
            "python_executable": sys.executable,
        },
        "workspace_analysis": ws_info,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Optional absolute path to an application repository to inspect")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    try:
        data = run_preflight(args.workspace)
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
        print(f"Rust Anything Preflight Status: {data['status']}")
        print(f"  Rust cargo: {data['cli']['cargo'] or 'not found'}")
        print(f"  Rust compiler (rustc): {data['cli']['rustc'] or 'not found'}")
        print(f"  CLI rust-anything: {data['cli']['rust_anything'] or 'not found in PATH'}")
        if data["workspace_analysis"]:
            ws = data["workspace_analysis"]
            langs = ", ".join(ws["detected_languages"]) if ws["detected_languages"] else "none"
            print(f"  Workspace: {ws['path']}")
            print(f"  Source languages detected: {langs}")
            print(f"  Rust target crate present: {'yes' if ws['has_rust_target'] else 'no'}")
            print(f"  Recorded golden fixtures: {ws['fixtures']['recorded_json_fixtures_count']} files")

    return 0 if data["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
