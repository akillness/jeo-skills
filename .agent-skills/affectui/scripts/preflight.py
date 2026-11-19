#!/usr/bin/env python3
"""Offline workspace and shadcn/React 19 readiness preflight helper for affectui; never makes network calls or spawns processes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.exit_code = exit_code


def validate_safe_path(raw_path: str, must_exist: bool = True, must_dir: bool = False) -> Path:
    if not raw_path:
        raise PreflightError("empty path provided", 2)
    p = Path(raw_path)
    if not p.is_absolute():
        raise PreflightError(f"path must be absolute: {raw_path}", 2)
    for part in p.parts:
        if part in BLOCKED_PARTS:
            raise PreflightError(f"sensitive path component refused: {part}", 2)
        stem = part.split(".")[0].lower()
        if stem in SENSITIVE_STEMS:
            raise PreflightError(f"sensitive filename refused: {part}", 2)
    resolved = p.resolve()
    if must_exist and not resolved.exists():
        raise PreflightError(f"path does not exist: {resolved}", 2)
    if must_dir and resolved.exists() and not resolved.is_dir():
        raise PreflightError(f"expected directory path: {resolved}", 2)
    return resolved


def parse_json_file(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def inspect_workspace(workspace: Path) -> dict:
    pkg_path = workspace / "package.json"
    tsconfig_path = workspace / "tsconfig.json"
    comp_path = workspace / "components.json"

    pkg = parse_json_file(pkg_path) if pkg_path.is_file() else None
    deps = {}
    if pkg:
        for section in ("dependencies", "devDependencies", "peerDependencies"):
            sec = pkg.get(section)
            if isinstance(sec, dict):
                deps.update(sec)

    react_ver = deps.get("react")
    tsconfig = parse_json_file(tsconfig_path) if tsconfig_path.is_file() else None
    has_at_alias = False
    if tsconfig:
        paths = tsconfig.get("compilerOptions", {}).get("paths", {})
        if isinstance(paths, dict) and "@/*" in paths:
            has_at_alias = True

    comp = parse_json_file(comp_path) if comp_path.is_file() else None
    registries = comp.get("registries", {}) if comp else {}
    has_affectui_registry = isinstance(registries, dict) and "@affectui" in registries

    ui_dir = workspace / "components" / "ui"
    src_ui_dir = workspace / "src" / "components" / "ui"
    installed_items: list[str] = []
    for candidate in (ui_dir, src_ui_dir):
        if candidate.is_dir():
            installed_items.extend(sorted(f.name for f in candidate.iterdir() if f.is_file() and f.suffix in {".tsx", ".jsx"}))

    return {
        "path": str(workspace),
        "has_package_json": pkg is not None,
        "react_version": react_ver,
        "react_19_declared": isinstance(react_ver, str) and ("19" in react_ver),
        "has_at_alias": has_at_alias,
        "has_components_json": comp is not None,
        "has_affectui_registry": has_affectui_registry,
        "ui_component_files": installed_items[:50],
    }


def run_preflight(workspace_arg: str | None = None) -> dict:
    node_bin = shutil.which("node")
    npx_bin = shutil.which("npx")
    checks = [
        {"name": "node", "status": "ok" if node_bin else "missing", "detail": node_bin or "not found in PATH"},
        {"name": "npx", "status": "ok" if npx_bin else "missing", "detail": npx_bin or "not found in PATH"},
    ]
    ws_info = None
    if workspace_arg is not None:
        ws = validate_safe_path(workspace_arg, must_exist=True, must_dir=True)
        ws_info = inspect_workspace(ws)
        checks.append({
            "name": "package.json",
            "status": "ok" if ws_info["has_package_json"] else "missing",
            "detail": ws_info["react_version"] or "not declared",
        })
        checks.append({
            "name": "components.json",
            "status": "ok" if ws_info["has_components_json"] else "info",
            "detail": "@affectui configured" if ws_info["has_affectui_registry"] else "direct URL install works without @affectui namespace",
        })

    ready = bool(node_bin and npx_bin and (ws_info is None or ws_info["has_package_json"]))
    return {
        "skill": "affectui",
        "scope": "offline-preflight",
        "status": "ready" if ready else "blocked",
        "runtime_verified": False,
        "cli": {"node": node_bin, "npx": npx_bin},
        "workspace": ws_info,
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Absolute path to target React project directory")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args()
    try:
        report = run_preflight(args.workspace)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"skill": "affectui", "status": "error", "message": str(exc)}, indent=2))
        else:
            print(f"error: {exc}", file=sys.stderr)
        return exc.exit_code

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"affectui preflight: {report['status']}")
        for c in report["checks"]:
            print(f"  - {c['name']}: {c['status']} ({c['detail']})")
    return 0 if report["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
