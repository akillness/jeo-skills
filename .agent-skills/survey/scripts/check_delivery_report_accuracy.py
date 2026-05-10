#!/usr/bin/env python3
"""Sanity-check delivery-report.md claims against current survey artifacts.

Usage:
  python3 .agent-skills/survey/scripts/check_delivery_report_accuracy.py .survey/<slug> [output.json]
"""

import argparse
import json
import os
import re
import sys


def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser(description="Validate delivery report claim freshness")
    ap.add_argument("survey_dir", help=".survey/<slug> directory")
    ap.add_argument("output", nargs="?", help="Optional JSON output path")
    args = ap.parse_args()

    survey_dir = args.survey_dir.rstrip("/")
    report_path = os.path.join(survey_dir, "delivery-report.md")
    evidence_path = os.path.join(survey_dir, "evidence.json")

    if not os.path.isfile(report_path):
        raise SystemExit("missing delivery report: {}".format(report_path))
    if not os.path.isfile(evidence_path):
        raise SystemExit("missing evidence: {}".format(evidence_path))

    report = read_text(report_path)
    evidence = json.loads(read_text(evidence_path))

    lanes = evidence.get("lanes", {})
    lane_count = len(lanes)
    kept_total = 0
    for lane in lanes.values():
        kept_total += int(lane.get("kept_count", 0) or 0)

    problems = []
    stale_tokens = ["lorem ipsum", "tbd", "todo", "example contribution", "placeholder"]
    lowered = report.lower()
    for token in stale_tokens:
        if token in lowered:
            problems.append("stale-token:{}".format(token))

    if "Development Contributions" not in report:
        problems.append("missing-heading:Development Contributions")

    # Lightweight consistency check: report should mention at least one current-run metric.
    metric_patterns = [
        r"kept[_ -]?total[: ]+{}\\b".format(kept_total),
        r"lane[_ -]?count[: ]+{}\\b".format(lane_count),
        r"{}\\s+lanes".format(lane_count),
        r"recommended_lane_count[: ]+`?\\d+`?",
        r"slug:\s*`?hourly-skill-candidates-",
    ]
    if not any(re.search(p, report, flags=re.IGNORECASE) for p in metric_patterns):
        problems.append("missing-current-metrics")

    result = {
        "ok": len(problems) == 0,
        "problems": problems,
        "lane_count": lane_count,
        "kept_total": kept_total,
        "report_path": report_path,
    }

    out = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out)
    else:
        sys.stdout.write(out)

    if problems:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
