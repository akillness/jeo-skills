#!/usr/bin/env python3
import argparse
import io
import json
import os
import sys

REQUIRED_HEADINGS = [
    "## Summary",
    "## Evidence",
    "## Risk",
    "## Rollback",
    "## Validation",
]


def main():
    parser = argparse.ArgumentParser(description="Validate required PR body headings for hourly runs.")
    parser.add_argument("pr_body_path", help="Path to PR body markdown file")
    parser.add_argument("output_json", help="Path to output JSON report")
    args = parser.parse_args()

    if not os.path.exists(args.pr_body_path):
        sys.stderr.write("missing pr body file: {0}\n".format(args.pr_body_path))
        return 2

    with io.open(args.pr_body_path, "r", encoding="utf-8") as f:
        text = f.read()

    missing = []
    for h in REQUIRED_HEADINGS:
        if h not in text:
            missing.append(h)

    report = {
        "ok": len(missing) == 0,
        "required_headings": REQUIRED_HEADINGS,
        "missing_headings": missing,
        "pr_body_path": args.pr_body_path,
    }

    with io.open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")

    if missing:
        sys.stderr.write("missing headings: {0}\n".format(", ".join(missing)))
        return 1

    print("PR body section validation: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
