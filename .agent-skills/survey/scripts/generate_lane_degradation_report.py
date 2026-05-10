#!/usr/bin/env python3
"""Render deterministic degraded-lane report from hourly evidence.

Usage:
  python3 .agent-skills/survey/scripts/generate_lane_degradation_report.py \
    .survey/<slug>/evidence.json \
    .survey/<slug>/lane-degradation-report.md \
    .survey/<slug>/lane-degradation-report.json
"""

import json
import os
import statistics
import sys


def _median_stars(items):
    stars = []
    for it in items:
        try:
            stars.append(int(it.get("stargazersCount", 0) or 0))
        except Exception:
            stars.append(0)
    if not stars:
        return 0
    return int(statistics.median(stars))


def main(argv):
    if len(argv) != 4:
        sys.stderr.write("usage: generate_lane_degradation_report.py <evidence.json> <output.md> <output.json>\n")
        return 2

    evidence_path = argv[1]
    output_md = argv[2]
    output_json = argv[3]

    if not os.path.isfile(evidence_path):
        sys.stderr.write("missing evidence.json: {}\n".format(evidence_path))
        return 2

    with open(evidence_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes", {})
    rows = []
    degraded_count = 0
    for lane_key in sorted(lanes.keys()):
        lane = lanes.get(lane_key, {})
        raw = lane.get("raw_results", []) or []
        kept = lane.get("kept_results", []) or []
        raw_count = int(lane.get("raw_count", len(raw)) or 0)
        kept_count = int(lane.get("kept_count", len(kept)) or 0)
        zero_star_raw = 0
        for it in raw:
            try:
                if int(it.get("stargazersCount", 0) or 0) == 0:
                    zero_star_raw += 1
            except Exception:
                zero_star_raw += 1

        median_stars_raw = _median_stars(raw)
        causes = lane.get("degraded_causes", []) or []
        status = "pass" if kept_count > 0 and not causes else "degraded"
        if status == "degraded":
            degraded_count += 1

        rows.append({
            "lane": lane_key,
            "status": status,
            "raw_count": raw_count,
            "kept_count": kept_count,
            "zero_star_raw": zero_star_raw,
            "median_stars_raw": median_stars_raw,
            "degraded_causes": causes,
        })

    report = {
        "lane_count": len(rows),
        "degraded_lane_count": degraded_count,
        "degraded_lanes": [r["lane"] for r in rows if r["status"] == "degraded"],
        "rows": rows,
    }

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")

    lines = [
        "# Lane Degradation Report",
        "",
        "- degraded_lane_count: {}".format(degraded_count),
        "- lane_count: {}".format(len(rows)),
        "",
        "| lane | status | kept/raw | median_stars_raw | zero_star_raw | degraded_causes |",
        "|---|---|---:|---:|---:|---|",
    ]
    for r in rows:
        cause_text = ", ".join(r["degraded_causes"]) if r["degraded_causes"] else "-"
        lines.append("| {lane} | {status} | {kept}/{raw} | {median} | {zero} | {causes} |".format(
            lane=r["lane"], status=r["status"], kept=r["kept_count"], raw=r["raw_count"],
            median=r["median_stars_raw"], zero=r["zero_star_raw"], causes=cause_text
        ))

    with open(output_md, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
