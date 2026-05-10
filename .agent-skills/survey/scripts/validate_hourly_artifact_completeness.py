#!/usr/bin/env python3
"""Validate required hourly survey artifact files exist for a slug directory.

Usage:
  python3 .agent-skills/survey/scripts/validate_hourly_artifact_completeness.py \
    .survey/<slug> .survey/<slug>/artifact-completeness.json
"""

import json
import os
import sys


REQUIRED = [
    "evidence.json",
    "triage.md",
    "context.md",
    "solutions.md",
    "platform-map.md",
    "rtk-summary.md",
    "graphify-refined.json",
    "obsidian-note.md",
    "llm-wiki-note.md",
    "hourly-run-report.json",
    "delivery-report.md",
    "lane-health.md",
    "lane-health.json",
    "deduped-recommendations.json",
    "lane-degradation-report.md",
    "lane-degradation-report.json",
    "lane-quality-gate.json",
    "recovery-stage-coverage.json",
    "ci-bootstrap-readiness.json",
]


def main():
    if len(sys.argv) != 3:
        sys.stderr.write(
            "usage: validate_hourly_artifact_completeness.py <survey_dir> <output_json>\n"
        )
        return 2

    survey_dir = sys.argv[1].rstrip("/")
    out_path = sys.argv[2]

    missing = []
    present = []
    for rel in REQUIRED:
        p = os.path.join(survey_dir, rel)
        if os.path.isfile(p):
            present.append(rel)
        else:
            missing.append(rel)

    report = {
        "survey_dir": survey_dir,
        "required_count": len(REQUIRED),
        "present_count": len(present),
        "missing_count": len(missing),
        "present": present,
        "missing": missing,
        "status": "PASS" if not missing else "FAIL",
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if missing:
        sys.stderr.write("missing required artifacts: {}\n".format(", ".join(missing)))
        return 1

    print("hourly artifact completeness: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
