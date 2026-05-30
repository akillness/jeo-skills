#!/usr/bin/env python3
"""Validate deep-dive trace/spec markdown artifacts."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


TRACE_HEADINGS = [
    "## Observed Result",
    "## Ranked Hypotheses",
    "## Evidence Summary by Hypothesis",
    "## Evidence Against / Missing Evidence",
    "## Per-Lane Critical Unknowns",
    "## Rebuttal Round",
    "## Convergence / Separation Notes",
    "## Most Likely Explanation",
    "## Critical Unknown",
    "## Recommended Discriminating Probe",
]

SPEC_HEADINGS = [
    "## Goal",
    "## Constraints",
    "## Non-Goals",
    "## Acceptance Criteria",
    "## Assumptions Exposed",
    "## Technical Context",
    "## Trace Findings",
]

ALLOWED_PREFIXES = (
    ".omc/specs/",
    ".omx/specs/",
    ".agents/specs/",
    ".agent-skills/",
)


def relish(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def validate_path(path: Path, label: str) -> list[str]:
    errors: list[str] = []
    rel = relish(path)
    if not path.exists():
        return [f"{label}: missing file: {rel}"]
    if not any(rel.startswith(prefix) for prefix in ALLOWED_PREFIXES):
        errors.append(
            f"{label}: unexpected artifact path {rel}; expected one of "
            + ", ".join(ALLOWED_PREFIXES)
        )
    if path.suffix.lower() != ".md":
        errors.append(f"{label}: expected markdown file: {rel}")
    return errors


def validate_headings(path: Path, headings: list[str], label: str) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [heading for heading in headings if heading not in text]
    return [f"{label}: missing heading {heading}" for heading in missing]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace", type=Path)
    parser.add_argument("--spec", type=Path)
    args = parser.parse_args()

    if not args.trace and not args.spec:
        parser.error("provide --trace and/or --spec")

    errors: list[str] = []
    if args.trace:
        errors.extend(validate_path(args.trace, "trace"))
        if args.trace.exists():
            errors.extend(validate_headings(args.trace, TRACE_HEADINGS, "trace"))
    if args.spec:
        errors.extend(validate_path(args.spec, "spec"))
        if args.spec.exists():
            errors.extend(validate_headings(args.spec, SPEC_HEADINGS, "spec"))

    if errors:
        for error in errors:
            print(f"[FAIL] {error}", file=sys.stderr)
        return 1

    print("Deep-dive artifact validation: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
