#!/usr/bin/env python3
"""Offline Tailwind CSS 4 / shadcn Base UI and CSS import preflight helper for solid-glass; never makes network calls or spawns processes."""

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


def inspect_css_files(workspace: Path) -> list[dict]:
    findings = []
    candidates = [
        workspace / "src" / "index.css",
        workspace / "src" / "app" / "globals.css",
        workspace / "app" / "globals.css",
        workspace / "src" / "styles" / "globals.css",
    ]
    for css_file in candidates:
        if not css_file.is_file():
            continue
        try:
            text = css_file.read_text(encoding="utf-8")
        except OSError:
            continue
        tw_idx = text.find('@import "tailwindcss"')
        if tw_idx < 0:
            tw_idx = text.find("@import 'tailwindcss'")
        sg_idx = text.find("solid-glass.css")
        findings.append({
            "file": str(css_file.relative_to(workspace)),
            "imports_tailwind": tw_idx >= 0,
            "imports_solid_glass": sg_idx >= 0,
            "solid_glass_after_tailwind": (tw_idx >= 0 and sg_idx > tw_idx),
            "has_root_vars_block": (":root {" in text or ":root{" in text) and sg_idx >= 0,
        })
    return findings


def inspect_workspace(workspace: Path) -> dict:
    pkg_path = workspace / "package.json"
    pkg = None
    if pkg_path.is_file():
        try:
            loaded = json.loads(pkg_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                pkg = loaded
        except (OSError, json.JSONDecodeError):
            pkg = None

    deps = {}
    if pkg:
        for sec in ("dependencies", "devDependencies"):
            block = pkg.get(sec)
            if isinstance(block, dict):
                deps.update(block)

    tw_ver = deps.get("tailwindcss")
    base_ui = deps.get("@base-ui/react")
    comp_path = workspace / "components.json"
    css_findings = inspect_css_files(workspace)

    return {
        "path": str(workspace),
        "has_package_json": pkg is not None,
        "react_version": deps.get("react"),
        "tailwindcss_version": tw_ver,
        "tailwind_v4_declared": isinstance(tw_ver, str) and ("4" in tw_ver),
        "base_ui_version": base_ui,
        "has_components_json": comp_path.is_file(),
        "css_checks": css_findings,
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
            "name": "tailwindcss-4",
            "status": "ok" if ws_info["tailwind_v4_declared"] else "missing",
            "detail": ws_info["tailwindcss_version"] or "tailwindcss v4 not declared",
        })
        checks.append({
            "name": "components.json",
            "status": "ok" if ws_info["has_components_json"] else "missing",
            "detail": "present" if ws_info["has_components_json"] else "run npx shadcn@latest init first",
        })

    ready = bool(node_bin and npx_bin and (ws_info is None or (ws_info["has_package_json"] and ws_info["tailwind_v4_declared"])))
    return {
        "skill": "solid-glass",
        "scope": "offline-preflight",
        "status": "ready" if ready else "blocked",
        "runtime_verified": False,
        "cli": {"node": node_bin, "npx": npx_bin},
        "workspace": ws_info,
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Absolute path to target React + Tailwind v4 project directory")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args()
    try:
        report = run_preflight(args.workspace)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"skill": "solid-glass", "status": "error", "message": str(exc)}, indent=2))
        else:
            print(f"error: {exc}", file=sys.stderr)
        return exc.exit_code

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"solid-glass preflight: {report['status']}")
        for c in report["checks"]:
            print(f"  - {c['name']}: {c['status']} ({c['detail']})")
    return 0 if report["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
