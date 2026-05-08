#!/usr/bin/env python3
"""Deduplicate recommendation-grade repositories across hourly lanes.

Usage:
  python3 .agent-skills/survey/scripts/dedupe_hourly_recommendations.py \
    .survey/<slug>/evidence.json .survey/<slug>/deduped-recommendations.json
"""
import json
import sys


def norm_name(item):
    name = item.get("fullName") or ""
    return name.strip().lower()


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: dedupe_hourly_recommendations.py <evidence.json> <out.json>\n")
        return 2
    evidence_path = sys.argv[1]
    out_path = sys.argv[2]

    with open(evidence_path, "r") as f:
        evidence = json.load(f)

    lanes = evidence.get("lanes") or {}
    seen = {}
    for lane_name in sorted(lanes.keys()):
        lane = lanes.get(lane_name) or {}
        for rec in lane.get("recommended") or []:
            key = norm_name(rec)
            if not key:
                continue
            if key not in seen:
                row = dict(rec)
                row["first_lane"] = lane_name
                row["also_seen_in_lanes"] = []
                seen[key] = row
            else:
                seen[key]["also_seen_in_lanes"].append(lane_name)

    deduped = sorted(seen.values(), key=lambda x: int(x.get("stars") or 0), reverse=True)
    payload = {
        "recommended_raw_count": sum(len((lanes.get(k) or {}).get("recommended") or []) for k in lanes.keys()),
        "recommended_dedup_count": len(deduped),
        "deduped_recommendations": deduped,
    }

    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)

    sys.stdout.write(
        "wrote {0} (raw={1}, dedup={2})\n".format(
            out_path, payload["recommended_raw_count"], payload["recommended_dedup_count"]
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
