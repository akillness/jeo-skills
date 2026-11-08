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
    init_parser.add_argument("--deep", action="store_true", help="Enable Deep mode for initial run (runtime flag, not stored in craft.json)")
    init_parser.add_argument("--backend", default="Claude Code", help="Coding agent backend name")
    init_parser.add_argument("--build-with", default=None, help="Target engine or stack name")
    init_parser.add_argument("--dry-run", action="store_true", help="Preview scaffold actions without writing")
    init_parser.add_argument("--json", action="store_true", help="Emit output as JSON")

    return parser.parse_args(argv)


def parse_target_ref(target: str) -> dict[str, Any]:
    t = target.strip().strip('"')
    if t == "-":
        return {"kind": "none"}
    if t.startswith(("http://", "https://")):
        return {"kind": "website", "url": t}
    p = Path(t).expanduser()
    if t and p.is_absolute() and p.exists():
        return {"kind": "local", "path": str(p.resolve())}
    raise ProjectError(
        f"{target!r} is neither a web address nor an existing absolute path. "
        "Pass https://… for a website, a full path for a program, or - for none."
    )


def format_target_label(target_val: Any) -> str:
    if isinstance(target_val, dict):
        kind = target_val.get("kind")
        if kind == "website":
            return str(target_val.get("url", ""))
        if kind == "local":
            path = str(target_val.get("path", ""))
            return Path(path).name or path
        if kind == "none":
            return ""
        return str(target_val)
    if isinstance(target_val, str):
        return target_val
    return ""


def inspect_rebuild_project(project_dir: Path) -> dict[str, Any]:
    manifest_file = project_dir / PROJECT_MANIFEST
    try:
        data = json.loads(manifest_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProjectError(f"Malformed {PROJECT_MANIFEST}: {exc}") from exc

    if not isinstance(data, dict):
        raise ProjectError(f"{PROJECT_MANIFEST} must be a JSON object")

    app_dir = project_dir / "app"
    checks_dir = project_dir / "checks"
    capture_dir = project_dir / "capture"
    inbox_dir = project_dir / "inbox"
    cany_dir = project_dir / "investigation.cany"

    app_file_count = sum(1 for _ in app_dir.rglob("*") if _.is_file()) if app_dir.is_dir() else 0
    checks_list = data.get("checks", [])
    if isinstance(checks_list, list) and checks_list:
        checks_count = len(checks_list)
    elif checks_dir.is_dir():
        checks_count = len(list(checks_dir.glob("*.json"))) + len(list(checks_dir.glob("round-*")))
    else:
        checks_count = 0
    capture_count = len(list(capture_dir.glob("*.*"))) if capture_dir.is_dir() else 0

    pending_approvals = 0
    open_questions = 0
    if inbox_dir.is_dir():
        # Upstream inbox protocol:
        # Request is in `<id>.request.json`. It is pending if `<id>.answer.json` does NOT exist.
        for req_file in sorted(inbox_dir.glob("*.request.json")):
            req_id = req_file.name[:-len(".request.json")]
            ans_file = inbox_dir / f"{req_id}.answer.json"
            if ans_file.is_file():
                continue  # Already answered
            try:
                card_data = json.loads(req_file.read_text(encoding="utf-8"))
                kind = card_data.get("kind", "")
                if kind == "approval":
                    pending_approvals += 1
                elif kind == "question":
                    open_questions += 1
                else:
                    pending_approvals += 1
            except Exception:
                pending_approvals += 1

        # Resilient fallback for standalone or legacy cards:
        for other in sorted(inbox_dir.glob("*.json")):
            if other.name.endswith(".request.json") or other.name.endswith(".answer.json"):
                continue
            try:
                card_data = json.loads(other.read_text(encoding="utf-8"))
                kind = card_data.get("kind", "")
                status = card_data.get("status", "pending")
                if status == "pending":
                    if "approve" in str(kind).lower():
                        pending_approvals += 1
                    elif "question" in str(kind).lower() or "ask" in str(kind).lower():
                        open_questions += 1
            except Exception:
                pass

    raw_target = data.get("target")

    return {
        "project_type": "rebuild",
        "path": str(project_dir.resolve()),
        "name": data.get("name", project_dir.name),
        "target": raw_target,
        "target_label": format_target_label(raw_target),
        "request": data.get("request", ""),
        "status": data.get("status", "new"),
        "version": data.get("version", 0),
        "builder": data.get("builder"),
        "stack": data.get("stack", ""),
        "checks_count": checks_count,
        "app_files": app_file_count,
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
        manifest_file = target_path / PROJECT_MANIFEST
        try:
            raw_data = json.loads(manifest_file.read_text(encoding="utf-8"))
        except Exception:
            raw_data = {}

        # 1. name validation
        name = raw_data.get("name")
        if name is None or not str(name).strip():
            issues.append("Missing or empty required field 'name' in craft.json")

        # 2. request validation
        request = raw_data.get("request")
        if request is None:
            issues.append("Missing required field 'request' in craft.json")
        elif not isinstance(request, str):
            issues.append("Field 'request' in craft.json must be a string")

        # 3. target validation (TargetRef object or string)
        target = raw_data.get("target")
        if target is None:
            issues.append("Missing required field 'target' in craft.json")
        elif isinstance(target, dict):
            kind = target.get("kind")
            if kind not in ("website", "local", "none"):
                issues.append(f"Invalid target.kind {kind!r} in craft.json: must be 'website', 'local', or 'none'")
            elif kind == "website":
                url = target.get("url")
                if not url or not isinstance(url, str) or not url.startswith(("http://", "https://")):
                    issues.append("Target kind 'website' requires a valid 'url' starting with http:// or https://")
            elif kind == "local":
                path = target.get("path")
                if not path or not isinstance(path, str):
                    issues.append("Target kind 'local' requires a valid 'path'")
            elif kind == "none":
                pass
        elif isinstance(target, str):
            if not target.strip():
                issues.append("Target string cannot be empty")
        else:
            issues.append(f"Invalid target format: expected object or string, got {type(target).__name__}")

        # 4. version validation
        version = raw_data.get("version")
        if version is not None:
            if not isinstance(version, int) or version < 0:
                issues.append("Field 'version' in craft.json must be a non-negative integer")
            elif version > 3:
                issues.append(f"craft.json version ({version}) is newer than supported MANIFEST_VERSION (3)")

        # 5. pending approvals validation
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

    target_ref = parse_target_ref(target_clean)

    now_ms = int(time.time() * 1000)
    manifest_content: dict[str, Any] = {
        "version": 3,
        "name": dest.name,
        "request": request_clean,
        "target": target_ref,
        "stack": build_with or "",
        "status": "new",
        "note": "",
        "created_ms": now_ms,
        "updated_ms": now_ms,
        "checks": [],
        "allowed_actions": [],
        "last_reply": "",
        "asset_budget_usd": 5.0,
        "generate_assets": False,
    }
    if backend:
        manifest_content["builder"] = backend

    planned_actions = [
        {"action": "create_dir", "path": str(dest)},
        {"action": "create_file", "path": str(dest / PROJECT_MANIFEST)},
    ]

    if not dry_run:
        dest.mkdir(parents=True, exist_ok=True)
        (dest / PROJECT_MANIFEST).write_text(json.dumps(manifest_content, indent=2) + "\n", encoding="utf-8")

    return {
        "status": "ok",
        "dry_run": dry_run,
        "project_dir": str(dest.resolve() if dest.exists() else dest),
        "manifest": manifest_content,
        "runtime_mode": "deep" if deep else "clean_room",
        "actions": planned_actions,
    }

def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, (int, bool)) else (0 if exc.code is None else 2)
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
                    target_disp = p.get("target_label") or p.get("target") or "-"
                    print(f"  Target: {target_disp}")
                    print(f"  Request: {p['request']}")
                    print(f"  Status: {p['status']}")
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
