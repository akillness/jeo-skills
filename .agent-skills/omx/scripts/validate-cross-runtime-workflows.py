#!/usr/bin/env python3
"""Validate cross-runtime team/autopilot/ultrawork/ultraqa documentation coverage."""

from __future__ import annotations

import argparse
from pathlib import Path


CHECKS = {
    ".agent-skills/omc/SKILL.md": [
        "cross-runtime-parity",
        "/autopilot",
        "$autopilot",
        "ultraqa",
        "references/cross-runtime-workflow-map.md",
    ],
    ".agent-skills/omx/SKILL.md": [
        "$autopilot",
        "$ulw",
        "$ultraqa",
        "references/parallel-quality-workflows.md",
    ],
    ".agent-skills/ohmg/SKILL.md": [
        "/plan",
        "/work",
        "/orchestrate",
        "/review",
        "references/parallel-quality-workflows.md",
    ],
    ".agent-skills/omc/references/cross-runtime-workflow-map.md": [
        "$team",
        "$autopilot",
        "/plan",
        "/work",
        "$ultraqa",
        "oma agent:parallel",
    ],
    ".agent-skills/omx/references/parallel-quality-workflows.md": [
        "$team",
        "$autopilot",
        "$ulw",
        "$ultraqa",
    ],
    ".agent-skills/ohmg/references/parallel-quality-workflows.md": [
        "/plan",
        "/work",
        "/orchestrate",
        "/ultrawork",
        "/review",
    ],
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".", help="Repository root")
    args = parser.parse_args()

    root = Path(args.repo_root).resolve()
    failures: list[str] = []

    for rel_path, required_terms in CHECKS.items():
        path = root / rel_path
        if not path.exists():
            failures.append(f"{rel_path}: missing")
            continue
        text = path.read_text(encoding="utf-8")
        for term in required_terms:
            if term not in text:
                failures.append(f"{rel_path}: missing {term!r}")

    if failures:
        for failure in failures:
            print(f"[FAIL] {failure}")
        return 1

    print(f"Cross-runtime workflow validation: PASS ({len(CHECKS)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
