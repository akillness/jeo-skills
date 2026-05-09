#!/usr/bin/env python3
"""Validate and summarize stage coverage for hourly lane recovery queries.

Usage:
  python3 collect_lane_recovery_coverage.py <evidence.json> <output.json>
"""

import json
import os
import sys


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: collect_lane_recovery_coverage.py <evidence.json> <output.json>\n")
        return 2

    evidence_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(evidence_path):
        sys.stderr.write("missing evidence file: {0}\n".format(evidence_path))
        return 2

    with open(evidence_path, "r", encoding="utf-8") as f:
        evidence = json.load(f)

    lanes = evidence.get("lanes", {})
    summary = {
        "ok": True,
        "lane_count": 0,
        "missing_stage_1": [],
        "missing_stage_2": [],
        "lane_stage_coverage": {}
    }

    for lane_name in sorted(lanes.keys()):
        lane = lanes.get(lane_name) or {}
        recovery = lane.get("recovery_queries") or []
        stages = []
        for entry in recovery:
            stage = str((entry or {}).get("stage", "")).strip().lower()
            if stage:
                stages.append(stage)

        has_stage_1 = "stage-1" in stages
        has_stage_2 = "stage-2" in stages
        summary["lane_count"] += 1
        summary["lane_stage_coverage"][lane_name] = {
            "has_stage_1": has_stage_1,
            "has_stage_2": has_stage_2,
            "recovery_query_count": len(recovery)
        }

        if not has_stage_1:
            summary["missing_stage_1"].append(lane_name)
        if not has_stage_2:
            summary["missing_stage_2"].append(lane_name)

    if summary["missing_stage_1"] or summary["missing_stage_2"]:
        summary["ok"] = False

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
