#!/usr/bin/env python3
"""Print compact lane metrics for hourly evidence.json.

Usage:
  python3 .agent-skills/survey/scripts/print_lane_metrics.py .survey/<slug>/evidence.json
"""

import json
import os
import sys


def _as_int(v):
    try:
        return int(v)
    except Exception:
        return 0


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: print_lane_metrics.py <evidence.json>\n")
        return 2

    path = sys.argv[1]
    if not os.path.isfile(path):
        sys.stderr.write("missing evidence.json: {}\n".format(path))
        return 2

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes") or {}
    print("lane\traw\tkept\tzero_star\tmedian_stars\tstatus\tcauses")

    raw_total = 0
    kept_total = 0
    for lane in sorted(lanes.keys()):
        entry = lanes.get(lane) or {}
        raw = _as_int(entry.get("raw_count", 0))
        kept = _as_int(entry.get("kept_count", 0))
        zero_star = _as_int(entry.get("zero_star_raw", 0))
        median = _as_int(entry.get("median_stars_raw", 0))
        status = entry.get("lane_status") or "unknown"
        causes = ",".join(entry.get("degraded_causes") or [])
        print("{}\t{}\t{}\t{}\t{}\t{}\t{}".format(lane, raw, kept, zero_star, median, status, causes))
        raw_total += raw
        kept_total += kept

    print("TOTAL\t{}\t{}\t-\t-\t-\t-".format(raw_total, kept_total))
    print("recommended_lane_count\t{}".format(_as_int(data.get("recommended_lane_count", 0))))
    print("single_lane_concentration\t{}".format(bool(data.get("single_lane_concentration", False))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
