#!/usr/bin/env python3
"""Inspect OpenMontage pipeline manifests without importing OpenMontage or PyYAML.

The parser deliberately reads only the stable structural subset needed for a
pre-install inventory: top-level identity/orchestration fields and stage names,
director paths, and gate booleans. OpenMontage's own YAML loader remains the
runtime authority after dependencies are installed.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path
from typing import Any


TOP_LEVEL_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$")
NESTED_FIELD_RE = re.compile(r"^  ([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$")
STAGE_NAME_RE = re.compile(r"^  - name:\s*(.*?)\s*$")
STAGE_FIELD_RE = re.compile(r"^    ([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$")
INLINE_COMMENT_RE = re.compile(r"\s+#")


def scalar(raw: str | None) -> Any:
    """Parse the small YAML scalar subset used by the inventory."""
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    comment = INLINE_COMMENT_RE.search(value)
    if comment:
        value = value[: comment.start()].rstrip()
    if not value:
        return None
    if value[0:1] in {"'", '"'}:
        try:
            return ast.literal_eval(value)
        except (SyntaxError, ValueError):
            return value.strip("'\"")
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered in {"null", "~"}:
        return None
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?(?:\d+\.\d*|\d*\.\d+)", value):
        return float(value)
    return value


def parse_manifest(path: Path) -> dict[str, Any]:
    top: dict[str, Any] = {}
    orchestration: dict[str, Any] = {}
    stages: list[dict[str, Any]] = []
    section: str | None = None
    current_stage: dict[str, Any] | None = None

    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc

    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        top_match = TOP_LEVEL_RE.match(line)
        if top_match:
            key, raw_value = top_match.groups()
            section = key
            current_stage = None
            top[key] = scalar(raw_value)
            continue

        if section == "orchestration":
            nested_match = NESTED_FIELD_RE.match(line)
            if nested_match:
                key, raw_value = nested_match.groups()
                orchestration[key] = scalar(raw_value)
            continue

        if section == "stages":
            stage_match = STAGE_NAME_RE.match(line)
            if stage_match:
                current_stage = {
                    "name": scalar(stage_match.group(1)),
                    "line": line_number,
                }
                stages.append(current_stage)
                continue
            field_match = STAGE_FIELD_RE.match(line)
            if field_match and current_stage is not None:
                key, raw_value = field_match.groups()
                if key in {
                    "skill",
                    "checkpoint_required",
                    "human_approval_default",
                }:
                    current_stage[key] = scalar(raw_value)

    return {
        "path": str(path),
        "name": top.get("name"),
        "version": top.get("version"),
        "category": top.get("category"),
        "orchestrator": orchestration.get("skill"),
        "budget_default_usd": orchestration.get("budget_default_usd"),
        "stages": stages,
    }


def skill_file(repo: Path, value: Any) -> Path | None:
    if not isinstance(value, str) or not value.strip():
        return None
    relative = Path(value)
    if relative.suffix != ".md":
        relative = relative.with_suffix(".md")
    return repo / "skills" / relative


def validate_manifest(repo: Path, manifest: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    path = Path(manifest["path"])
    label = path.name

    name = manifest.get("name")
    if not isinstance(name, str) or not name:
        errors.append(f"{label}: missing top-level name")
    elif name != path.stem:
        errors.append(f"{label}: name {name!r} does not match filename {path.stem!r}")

    if manifest.get("version") is None:
        errors.append(f"{label}: missing top-level version")
    if not isinstance(manifest.get("category"), str):
        errors.append(f"{label}: missing top-level category")

    stages = manifest.get("stages") or []
    if not stages:
        errors.append(f"{label}: no stages found")

    seen: set[str] = set()
    for stage in stages:
        stage_name = stage.get("name")
        line = stage.get("line", "?")
        if not isinstance(stage_name, str) or not stage_name:
            errors.append(f"{label}:{line}: stage has no name")
            continue
        if stage_name in seen:
            errors.append(f"{label}:{line}: duplicate stage {stage_name!r}")
        seen.add(stage_name)

        for field in ("checkpoint_required", "human_approval_default"):
            value = stage.get(field)
            if not isinstance(value, bool):
                errors.append(
                    f"{label}:{line}: stage {stage_name!r} needs boolean {field}"
                )

        declared_skill = stage.get("skill")
        target = skill_file(repo, declared_skill)
        if declared_skill is not None and target is None:
            errors.append(f"{label}:{line}: invalid skill value {declared_skill!r}")
        elif target is not None and not target.is_file():
            errors.append(
                f"{label}:{line}: stage {stage_name!r} references missing "
                f"{target.relative_to(repo)}"
            )
        elif declared_skill is None:
            warnings.append(f"{label}:{line}: stage {stage_name!r} declares no director")

    orchestrator = manifest.get("orchestrator")
    orchestrator_file = skill_file(repo, orchestrator)
    if orchestrator is not None and orchestrator_file is None:
        errors.append(f"{label}: invalid orchestration skill {orchestrator!r}")
    elif orchestrator_file is not None and not orchestrator_file.is_file():
        errors.append(
            f"{label}: orchestration skill references missing "
            f"{orchestrator_file.relative_to(repo)}"
        )
    elif orchestrator is None:
        warnings.append(f"{label}: no orchestration skill declared")

    return errors, warnings


def public_record(manifest: dict[str, Any]) -> dict[str, Any]:
    stages = manifest["stages"]
    return {
        "path": manifest["path"],
        "name": manifest["name"],
        "version": manifest["version"],
        "category": manifest["category"],
        "orchestrator": manifest["orchestrator"],
        "budget_default_usd": manifest["budget_default_usd"],
        "stages": [stage.get("name") for stage in stages],
        "checkpoint_stages": [
            stage.get("name") for stage in stages if stage.get("checkpoint_required")
        ],
        "approval_gates": [
            stage.get("name")
            for stage in stages
            if stage.get("human_approval_default")
        ],
        "directors": {
            str(stage.get("name")): stage.get("skill")
            for stage in stages
            if stage.get("skill") is not None
        },
    }


def print_table(records: list[dict[str, Any]]) -> None:
    headers = ("NAME", "VER", "CATEGORY", "STAGES", "GATES")
    rows = []
    for record in records:
        rows.append(
            (
                str(record["name"]),
                str(record["version"]),
                str(record["category"]),
                ",".join(record["stages"]),
                ",".join(record["approval_gates"]) or "-",
            )
        )
    widths = [
        max(len(headers[index]), *(len(row[index]) for row in rows))
        for index in range(len(headers))
    ]
    print("  ".join(headers[index].ljust(widths[index]) for index in range(len(headers))))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(row[index].ljust(widths[index]) for index in range(len(row))))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inventory OpenMontage pipeline manifests without project imports."
    )
    parser.add_argument(
        "repo",
        nargs="?",
        default=".",
        help="OpenMontage checkout (default: current directory)",
    )
    parser.add_argument(
        "--pipeline",
        help="Show only one pipeline name",
    )
    parser.add_argument(
        "--format",
        choices=("table", "json"),
        default="table",
        help="Output format (default: table)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail when structural errors or referenced skill paths are invalid",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    repo = Path(args.repo).expanduser().resolve()
    manifests_dir = repo / "pipeline_defs"
    if not (repo / "AGENT_GUIDE.md").is_file() or not manifests_dir.is_dir():
        print(f"error: not an OpenMontage checkout: {repo}", file=sys.stderr)
        return 2

    paths = sorted(manifests_dir.glob("*.yaml"))
    if not paths:
        print(f"error: no pipeline YAML files in {manifests_dir}", file=sys.stderr)
        return 2

    parsed: list[dict[str, Any]] = []
    errors: list[str] = []
    warnings: list[str] = []
    for path in paths:
        try:
            manifest = parse_manifest(path)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        manifest_errors, manifest_warnings = validate_manifest(repo, manifest)
        errors.extend(manifest_errors)
        warnings.extend(manifest_warnings)
        parsed.append(manifest)

    records = [public_record(item) for item in parsed]
    if args.pipeline:
        records = [item for item in records if item["name"] == args.pipeline]
        if not records:
            errors.append(f"pipeline not found: {args.pipeline}")

    if args.format == "json":
        print(
            json.dumps(
                {
                    "repo": str(repo),
                    "pipelines": records,
                    "errors": errors,
                    "warnings": warnings,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
    elif records:
        print_table(records)
        print()
        print(
            f"Summary: {len(records)} pipeline(s), "
            f"{sum(len(item['stages']) for item in records)} stage(s), "
            f"{sum(len(item['approval_gates']) for item in records)} gate(s)"
        )
        for warning in warnings:
            print(f"WARN: {warning}", file=sys.stderr)
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)

    if args.strict and errors:
        return 1
    return 0 if records else 2


if __name__ == "__main__":
    raise SystemExit(main())
