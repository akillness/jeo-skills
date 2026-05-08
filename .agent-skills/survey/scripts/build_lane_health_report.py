#!/usr/bin/env python3
"""Build compact lane-health markdown from hourly survey evidence.json."""
import json
import os
import sys


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: build_lane_health_report.py <survey-dir>\n")
        return 2
    survey_dir = sys.argv[1]
    evidence_path = os.path.join(survey_dir, "evidence.json")
    if not os.path.exists(evidence_path):
        sys.stderr.write("missing evidence.json: {}\n".format(evidence_path))
        return 2

    with open(evidence_path, "r", encoding="utf-8") as f:
        evidence = json.load(f)

    lanes = evidence.get("lanes", {})
    print("# Lane Health Report")
    print("")
    print("| Lane | Raw | Kept | Zero-star(raw) | Median stars(raw) | Status | Causes |")
    print("|------|-----|------|----------------|-------------------|--------|--------|")

    for lane, data in lanes.items():
        causes = ",".join(data.get("degraded_causes", [])) or "-"
        print("| {} | {} | {} | {} | {} | {} | {} |".format(
            lane,
            data.get("raw_count", 0),
            data.get("kept_count", 0),
            data.get("zero_star_raw", 0),
            data.get("median_stars_raw", 0),
            data.get("lane_status", "unknown"),
            causes,
        ))

    print("")
    print("recommended_lane_count: {}".format(evidence.get("recommended_lane_count", 0)))
    print("single_lane_concentration: {}".format(evidence.get("single_lane_concentration", False)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
