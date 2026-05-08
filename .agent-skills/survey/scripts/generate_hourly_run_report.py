#!/usr/bin/env python3
import json
import os
import sys

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: generate_hourly_run_report.py <survey_dir>\n")
        return 2
    survey_dir = sys.argv[1]
    evidence_path = os.path.join(survey_dir, "evidence.json")
    if not os.path.exists(evidence_path):
        sys.stderr.write("missing evidence.json: {0}\n".format(evidence_path))
        return 1

    with open(evidence_path, "r") as f:
        evidence = json.load(f)

    lanes = evidence.get("lanes", {})
    lane_rows = []
    degraded = []
    for lane, payload in lanes.items():
        row = {
            "lane": lane,
            "status": payload.get("lane_status", "unknown"),
            "raw_count": int(payload.get("raw_count", 0)),
            "kept_count": int(payload.get("kept_count", 0)),
            "median_stars_raw": int(payload.get("median_stars_raw", 0)),
            "degraded_causes": payload.get("degraded_causes", []),
        }
        lane_rows.append(row)
        if row["status"] != "pass":
            degraded.append({"lane": lane, "causes": row["degraded_causes"]})

    report = {
        "slug": evidence.get("slug"),
        "generated_at_utc": evidence.get("generated_at_utc"),
        "recommended_lane_count": int(evidence.get("recommended_lane_count", 0)),
        "single_lane_concentration": bool(evidence.get("single_lane_concentration", False)),
        "lane_rows": lane_rows,
        "degraded_lanes": degraded,
    }

    out_path = os.path.join(survey_dir, "hourly-run-report.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    sys.stdout.write(out_path + "\n")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
