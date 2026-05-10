#!/usr/bin/env python3
"""Check cross-lane recommendation concentration from hourly evidence.

Usage:
  python3 check_recommended_lane_concentration.py <evidence.json> <output.json>
"""

import json
import os
import sys


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: check_recommended_lane_concentration.py <evidence.json> <output.json>\n")
        raise SystemExit(2)

    evidence_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.isfile(evidence_path):
        sys.stderr.write("missing evidence: {}\n".format(evidence_path))
        raise SystemExit(2)

    with open(evidence_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes", {})
    recommended_lanes = []
    per_lane = {}

    for lane_name, lane in lanes.items():
        kept = int(lane.get("kept_count", 0) or 0)
        raw = int(lane.get("raw_count", 0) or 0)
        has_recommendation = kept > 0
        if has_recommendation:
            recommended_lanes.append(lane_name)
        per_lane[lane_name] = {
            "raw_count": raw,
            "kept_count": kept,
            "has_recommendation": has_recommendation,
        }

    recommended_lane_count = len(recommended_lanes)
    out = {
        "recommended_lane_count": recommended_lane_count,
        "single_lane_concentration": recommended_lane_count < 2,
        "recommended_lanes": recommended_lanes,
        "lane_metrics": per_lane,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")

    out["status"] = "degraded" if out["single_lane_concentration"] else "pass"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print("{}: recommended_lane_count={}".format(out["status"], recommended_lane_count))


if __name__ == "__main__":
    main()
