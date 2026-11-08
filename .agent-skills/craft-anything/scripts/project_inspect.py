#!/usr/bin/env python3
"""Inspect, validate, and initialize Craft Anything rebuild and investigation projects."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_MANIFEST = "craft.json"
INVESTIGATION_META = "project.toml"


class ProjectError(Exception):
    """Raised for project inspection/validation failures."""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="project_inspect.py",
        description="Inspect, validate, and scaffold Craft Anything project workspaces.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # inspect
    inspect_parser = subparsers.add_parser(
        "inspect",
        help="Inspect an existing Craft Anything project folder or workspace.",
    )
    inspect_parser.add_argument("path", help="Path to project directory")
    inspect_parser.add_argument("--json", action="store_true", help="Emit report as JSON")

    # validate
    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate project manifest schema and check for pending inbox approvals.",
    )
    validate_parser.add_argument("path", help="Path to project directory")
    validate_parser.add_argument("--json", action="store_true", help="Emit report as JSON")

    # init
    init_parser = subparsers.add_parser(
        "init",
        help="Scaffold a minimal compliant Craft Anything rebuild project folder.",
    )
    init_parser.add_argument("path", help="Destination path for the new project folder")
    init_parser.add_argument("--target", required=True, help="Web URL, file path, or '-' for prompt-only")
    init_parser.add_argument("--request", required=True, help="Description of what to build")
    init_parser.add_argument("--deep", action="store_true", help="Enable Deep mode (default: Clean room)")
    init_parser.add_argument("--backend", default="Claude Code", help="Coding agent backend name")
    init_parser.add_argument("--build-with", default=None, help="Target engine or stack name")
    init_parser.add_argument("--dry-run", action="store_true", help="Preview scaffold actions without writing")
    init_parser.add_argument("--json", action="store_true", help="Emit output as JSON")

    return parser.parse_args(argv)


def inspect_rebuild_project(project_dir: Path) -> dict[str, Any]:
    manifest_file = project_dir / PROJECT_MANIFEST
    try:
        data = json.loads(manifest_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProjectError(f"Malformed {PROJECT_MANIFEST}: {exc}") from exc

    app_dir = project_dir / "app"
    checks_dir = project_dir / "checks"
    capture_dir = project_dir / "capture"
    inbox_dir = project_dir / "inbox"
    cany_dir = project_dir / "investigation.cany"

    app_file_count = sum(1 for _ in app_dir.rglob("*") if _.is_file()) if app_dir.is_dir() else 0
    checks_count = len(list(checks_dir.glob("*.json"))) if checks_dir.is_dir() else 0
    capture_count = len(list(capture_dir.glob("*.*"))) if capture_dir.is_dir() else 0

    pending_approvals = 0
    open_questions = 0
    if inbox_dir.is_dir():
        for card in inbox_dir.glob("*.json"):
            try:
                card_data = json.loads(card.read_text(encoding="utf-8"))
                kind = card_data.get("kind", "")
                status = card_data.get("status", "pending")
                if "approve" in kind.lower() and status == "pending":
                    pending_approvals += 1
                elif "ask" in kind.lower() and status == "pending":
                    open_questions += 1
            except Exception:
                pending_approvals += 1

    return {
        "project_type": "rebuild",
        "path": str(project_dir.resolve()),
        "name": data.get("name", project_dir.name),
        "target": data.get("target"),
        "request": data.get("request"),
        "status": data.get("status", "unknown"),
        "clean_room": data.get("clean_room", True),
        "builder": data.get("builder"),
        "stack": data.get("stack"),
        "rounds_completed": data.get("rounds_completed", 0),
        "app_files": app_file_count,
        "checks_count": checks_count,
        "capture_count": capture_count,
        "pending_approvals": pending_approvals,
        "open_questions": open_questions,
        "has_investigation": cany_dir.is_dir(),
    }


def inspect_investigation_project(project_dir: Path) -> dict[str, Any]:
    meta_file = project_dir / INVESTIGATION_META
    content = meta_file.read_text(encoding="utf-8")

    name_match = re.search(r'name\s*=\s*"([^"]+)"', content)
    purpose_match = re.search(r'purpose\s*=\s*"([^"]+)"', content)
    version_match = re.search(r"format_version\s*=\s*(\d+)", content)

    evidence_dir = project_dir / "evidence"
    unknowns_dir = project_dir / "unknowns"
    annotations_dir = project_dir / "annotations"

    evidence_count = sum(1 for _ in evidence_dir.rglob("*.json")) if evidence_dir.is_dir() else 0
    unknowns_count = len(list(unknowns_dir.glob("*.json"))) if unknowns_dir.is_dir() else 0
    annotations_count = len(list(annotations_dir.glob("*.json"))) if annotations_dir.is_dir() else 0

    return {
        "project_type": "investigation",
        "path": str(project_dir.resolve()),
        "name": name_match.group(1) if name_match else project_dir.name,
        "purpose": purpose_match.group(1) if purpose_match else "unknown",
        "format_version": int(version_match.group(1)) if version_match else 1,
        "evidence_records": evidence_count,
        "unknowns_count": unknowns_count,
        "annotations_count": annotations_count,
        "has_notes": (project_dir / "notes.md").is_file(),
    }


def cmd_inspect(path_str: str) -> dict[str, Any]:
    target_path = Path(path_str).expanduser()
    if not target_path.exists():
        raise ProjectError(f"Directory does not exist: {target_path}")
    if not target_path.is_dir():
        raise ProjectError(f"Path is not a directory: {target_path}")

    if (target_path / PROJECT_MANIFEST).is_file():
        details = inspect_rebuild_project(target_path)
    elif (target_path / INVESTIGATION_META).is_file():
        details = inspect_investigation_project(target_path)
    else:
        raise ProjectError(
            f"Not a Craft Anything project folder: neither {PROJECT_MANIFEST} nor {INVESTIGATION_META} found in {target_path}"
        )

    return {"status": "ok", "project": details}


def cmd_validate(path_str: str) -> tuple[int, dict[str, Any]]:
    target_path = Path(path_str).expanduser()
    issues: list[str] = []

    try:
        report = cmd_inspect(str(target_path))
    except ProjectError as exc:
        return 1, {"status": "blocked", "valid": False, "issues": [str(exc)]}

    proj = report["project"]
    if proj["project_type"] == "rebuild":
        if not proj.get("request"):
            issues.append("Missing required field 'request' in craft.json")
        if proj.get("target") is None:
            issues.append("Missing required field 'target' in craft.json")
        if proj.get("pending_approvals", 0) > 0:
            issues.append(f"{proj['pending_approvals']} pending approval action(s) in inbox/")
    elif proj["project_type"] == "investigation":
        if proj.get("format_version", 0) < 1:
            issues.append("Invalid format_version in project.toml")

    is_valid = len(issues) == 0
    status = "ok" if is_valid else "blocked"
    exit_code = 0 if is_valid else 1

    return exit_code, {
        "status": status,
        "valid": is_valid,
        "issues": issues,
        "project": proj,
    }


def cmd_init(
    path_str: str,
    target: str,
    request: str,
    deep: bool,
    backend: str,
    build_with: str | None,
    dry_run: bool,
) -> dict[str, Any]:
    dest = Path(path_str).expanduser()
    target_clean = target.strip()
    request_clean = request.strip()

    if not request_clean:
        raise ProjectError("Project request cannot be empty.")
    if not target_clean:
        raise ProjectError("Project target cannot be empty (pass '-' for prompt-only).")

    if target_clean != "-" and not target_clean.startswith(("http://", "https://", "/")):
        raise ProjectError(f"Invalid target {target_clean!r}: must be a URL, an absolute path, or '-' for prompt-only.")

    planned_actions = [
        {"action": "create_dir", "path": str(dest)},
        {"action": "create_file", "path": str(dest / PROJECT_MANIFEST)},
        {"action": "create_dir", "path": str(dest / "app")},
        {"action": "create_dir", "path": str(dest / "checks")},
        {"action": "create_dir", "path": str(dest / "capture")},
        {"action": "create_dir", "path": str(dest / "inbox")},
        {"action": "create_dir", "path": str(dest / "investigation.cany")},
    ]

    manifest_content = {
        "name": dest.name,
        "target": target_clean,
        "request": request_clean,
        "created_at": int(time.time()),
        "status": "ready",
        "stack": build_with or "inferred",
        "clean_room": not deep,
        "builder": backend,
        "rounds_completed": 0,
        "asset_budget_usd": 0.0,
        "generate_assets": False,
        "history": [
            {
                "step": "init",
                "timestamp": int(time.time()),
                "summary": f"Initialized project with target '{target_clean}' via project_inspect.py",
            }
        ],
    }

    if not dry_run:
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "app").mkdir(exist_ok=True)
        (dest / "checks").mkdir(exist_ok=True)
        (dest / "capture").mkdir(exist_ok=True)
        (dest / "inbox").mkdir(exist_ok=True)
        (dest / "investigation.cany").mkdir(exist_ok=True)
        (dest / PROJECT_MANIFEST).write_text(json.dumps(manifest_content, indent=2) + "\n", encoding="utf-8")

    return {
        "status": "ok",
        "dry_run": dry_run,
        "project_dir": str(dest.resolve() if dest.exists() else dest),
        "manifest": manifest_content,
        "actions": planned_actions,
    }


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
    except SystemExit as exc:
        return 2

    wants_json = getattr(args, "json", False)

    try:
        if args.command == "inspect":
            result = cmd_inspect(args.path)
            if wants_json:
                print(json.dumps(result, indent=2))
            else:
                p = result["project"]
                print(f"[{p['project_type'].upper()}] {p['name']} ({p['path']})")
                if p["project_type"] == "rebuild":
                    print(f"  Target: {p['target']}")
                    print(f"  Request: {p['request']}")
                    print(f"  Status: {p['status']} (clean_room: {p['clean_room']})")
                    print(f"  App files: {p['app_files']}, Checks: {p['checks_count']}, Captures: {p['capture_count']}")
                    print(f"  Inbox: {p['pending_approvals']} pending approvals, {p['open_questions']} questions")
                else:
                    print(f"  Purpose: {p['purpose']} (format v{p['format_version']})")
                    print(f"  Evidence records: {p['evidence_records']}, Unknowns: {p['unknowns_count']}")
            return 0

        elif args.command == "validate":
            code, result = cmd_validate(args.path)
            if wants_json:
                print(json.dumps(result, indent=2))
            else:
                status_label = "VALID" if result["valid"] else "INVALID / BLOCKED"
                print(f"[{status_label}] {args.path}")
                for issue in result.get("issues", []):
                    print(f"  - {issue}")
            return code

        elif args.command == "init":
            result = cmd_init(
                args.path,
                args.target,
                args.request,
                args.deep,
                args.backend,
                args.build_with,
                args.dry_run,
            )
            if wants_json:
                print(json.dumps(result, indent=2))
            else:
                action_text = "Planned" if result["dry_run"] else "Created"
                print(f"[{action_text}] Craft Anything project at {result['project_dir']}")
                for a in result["actions"]:
                    print(f"  - {a['action']}: {a['path']}")
            return 0

    except ProjectError as exc:
        err = {"status": "error", "error": str(exc)}
        if wants_json:
            print(json.dumps(err, indent=2))
        else:
            print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
