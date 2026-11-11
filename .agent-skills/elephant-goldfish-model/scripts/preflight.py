#!/usr/bin/env python3
"""Check static EGM bundle markers without running or modifying the checkout."""

import argparse
import json
from pathlib import Path


SKILLS = ("brainstorm", "draft", "resolve", "bootstrap", "review", "review-loop", "drift-report")
MARKERS = [("plugin.json", "file")]
MARKERS += [(f"skills/egm-{name}/SKILL.md", "file") for name in SKILLS]
MARKERS += [(path, "dir") for path in ("agents", "resources/document_standards", "docs")]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True, type=Path, help="Explicit local checkout to inspect")
    parser.add_argument("--json", action="store_true", help="Print machine-readable results")
    args = parser.parse_args()
    root = args.checkout.resolve()
    checks = []
    for relative, kind in MARKERS:
        candidate = root / relative
        # Do not follow marker symlinks out of the explicitly named checkout.
        try:
            resolved = candidate.resolve()
            inside = resolved.is_relative_to(root)
            present = inside and (candidate.is_file() if kind == "file" else candidate.is_dir())
        except (OSError, RuntimeError):
            present = False
        checks.append({"path": relative, "status": "ok" if present else "missing"})
    result = {
        "skill": "elephant-goldfish-model",
        "scope": "offline-preflight",
        "checkout": str(root),
        "status": "ok" if all(item["status"] == "ok" for item in checks) else "blocked",
        "runtime_verified": False,
        "checks": checks,
    }
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"Static bundle: {result['status']} ({root}); runtime not verified")
        for check in checks:
            print(f"  {check['status']}: {check['path']}")
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
