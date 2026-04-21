#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

PROVENANCE_LABELS = [
    "direct page retrieval",
    "feed recovery",
    "browser-rendered retrieval",
    "indexed snippet",
    "browser-rendered indexed snippet",
    "thin evidence",
]

REQUIRED_FILES = {
    "triage.md": ["# Triage", "- Problem:", "- Audience:", "- Why now:"],
    "context.md": [
        "## Workflow Context",
        "## Affected Users",
        "## Current Workarounds",
        "## Adjacent Problems",
        "## User Voices",
    ],
    "solutions.md": [
        "## Solution List",
        "## Categories",
        "## What People Actually Use",
        "## Frequency Ranking",
        "## Key Gaps",
        "## Contradictions",
        "## Key Insight",
    ],
}

PLATFORM_HEADINGS = [
    "## Settings",
    "## Rules",
    "## Hooks",
    "## Platform Gaps",
]


def check_file(path: Path, headings: list[str], results: list[dict]) -> None:
    if not path.exists():
        results.append({"check": f"exists:{path.name}", "ok": False, "detail": "missing file"})
        return
    text = path.read_text(encoding="utf-8")
    results.append({"check": f"exists:{path.name}", "ok": True, "detail": str(path)})
    for heading in headings:
        results.append(
            {
                "check": f"heading:{path.name}:{heading}",
                "ok": heading in text,
                "detail": "found" if heading in text else "missing heading",
            }
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate `.survey/{slug}/` survey artifacts.")
    parser.add_argument("path", help="Path to the survey artifact directory")
    parser.add_argument("--platform-topic", action="store_true", help="Require platform-map.md and its headings")
    parser.add_argument("--require-provenance", action="store_true", help="Require at least one provenance label in the artifact files")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    base = Path(args.path)
    results: list[dict] = []

    results.append({"check": "directory_exists", "ok": base.exists() and base.is_dir(), "detail": str(base)})
    if not (base.exists() and base.is_dir()):
        payload = {"ok": False, "path": str(base), "checks": results}
        print(json.dumps(payload, indent=2) if args.json else f"ERROR: survey directory not found: {base}")
        return 1

    for filename, headings in REQUIRED_FILES.items():
        check_file(base / filename, headings, results)

    platform_file = base / "platform-map.md"
    if args.platform_topic:
        check_file(platform_file, PLATFORM_HEADINGS, results)
    elif platform_file.exists():
        check_file(platform_file, PLATFORM_HEADINGS, results)

    if args.require_provenance:
        combined = "\n".join(
            p.read_text(encoding="utf-8")
            for p in base.glob("*.md")
            if p.is_file()
        ).lower()
        found = [label for label in PROVENANCE_LABELS if label in combined]
        results.append(
            {
                "check": "provenance_labels",
                "ok": bool(found),
                "detail": ", ".join(found) if found else "no provenance labels found",
            }
        )

    ok = all(item["ok"] for item in results)
    payload = {"ok": ok, "path": str(base), "checks": results}

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(f"Survey artifact validation: {'PASS' if ok else 'FAIL'}")
        for item in results:
            status = "OK" if item["ok"] else "FAIL"
            print(f"- [{status}] {item['check']} :: {item['detail']}")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
