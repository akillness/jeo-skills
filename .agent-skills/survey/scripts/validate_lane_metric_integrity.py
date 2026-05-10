#!/usr/bin/env python3
"""Validate hourly lane metric integrity from evidence.json.

Checks impossible states such as kept_count > raw_count and mismatched
zero_star_raw bounds.

Usage:
  python3 validate_lane_metric_integrity.py <evidence.json> <output.json>
"""

import json
import os
import sys


def to_int(v):
    try:
        return int(v)
    except Exception:
        return 0


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("usage: python3 validate_lane_metric_integrity.py <evidence.json> <output.json>\n")
        return 2

    evidence_path = argv[1]
    output_path = argv[2]

    if not os.path.isfile(evidence_path):
        sys.stderr.write("missing evidence file: {}\n".format(evidence_path))
        return 2

    with open(evidence_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes", {})
    violations = []

    for lane_key in sorted(lanes.keys()):
        lane = lanes.get(lane_key, {})
        raw_count = to_int(lane.get("raw_count", 0))
        kept_count = to_int(lane.get("kept_count", 0))
        zero_star_raw = to_int(lane.get("zero_star_raw", 0))

        if raw_count < 0:
            violations.append({"lane": lane_key, "check": "raw_count_non_negative", "actual": raw_count})
        if kept_count < 0:
            violations.append({"lane": lane_key, "check": "kept_count_non_negative", "actual": kept_count})
        if kept_count > raw_count:
            violations.append({
                "lane": lane_key,
                "check": "kept_count_lte_raw_count",
                "raw_count": raw_count,
                "kept_count": kept_count,
            })
        if zero_star_raw < 0 or zero_star_raw > raw_count:
            violations.append({
                "lane": lane_key,
                "check": "zero_star_raw_range",
                "raw_count": raw_count,
                "zero_star_raw": zero_star_raw,
            })

    result = {
        "status": "pass" if not violations else "fail",
        "violation_count": len(violations),
        "violations": violations,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")

    if violations:
        sys.stderr.write("lane metric integrity: FAIL ({} violations)\n".format(len(violations)))
        return 1

    print("lane metric integrity: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
