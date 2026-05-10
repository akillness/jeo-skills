#!/usr/bin/env python3
"""Audit hourly evidence freshness drift by lane.

Usage:
  python3 audit_freshness_window.py .survey/<slug>/evidence.json [--months 24]
"""
import json
import sys
from datetime import datetime, timezone


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def age_months(ts):
    if ts is None:
        return None
    return (datetime.now(timezone.utc) - ts).days / 30.44


def main(argv):
    if len(argv) < 2:
        sys.stderr.write("usage: audit_freshness_window.py <evidence.json> [--months N]\n")
        return 2
    path = argv[1]
    threshold = 24.0
    if len(argv) >= 4 and argv[2] == "--months":
        threshold = float(argv[3])

    data = json.load(open(path))
    lanes = data.get("lanes") or {}
    out = {
        "threshold_months": threshold,
        "lanes": {},
        "totals": {"raw": 0, "stale": 0, "missing_ts": 0, "degraded_lanes": 0},
        "status": "pass",
        "degraded_causes": [],
    }

    for lane, lane_data in lanes.items():
        stale = 0
        missing = 0
        raw = lane_data.get("raw_examples") or []
        for item in raw:
            ts = parse_dt(item.get("pushedAt") or item.get("updatedAt"))
            if ts is None:
                missing += 1
                continue
            age = age_months(ts)
            if age is not None and age > threshold:
                stale += 1
        raw_n = len(raw)
        stale_ratio = (float(stale) / float(raw_n)) if raw_n else 0.0
        lane_status = "degraded" if (stale > 0 or missing > 0) else "pass"
        lane_degraded_causes = []
        if stale > 0:
            lane_degraded_causes.append("stale")
        if missing > 0:
            lane_degraded_causes.append("missing-timestamp")

        out["lanes"][lane] = {
            "raw_examples": raw_n,
            "stale_over_threshold": stale,
            "missing_timestamp": missing,
            "stale_ratio": round(stale_ratio, 4),
            "lane_status": lane_status,
            "degraded_causes": lane_degraded_causes,
        }
        out["totals"]["raw"] += raw_n
        out["totals"]["stale"] += stale
        out["totals"]["missing_ts"] += missing
        if lane_status != "pass":
            out["totals"]["degraded_lanes"] += 1

    if out["totals"]["degraded_lanes"] > 0:
        out["status"] = "degraded"
        if "stale" not in out["degraded_causes"] and out["totals"]["stale"] > 0:
            out["degraded_causes"].append("stale")
        if "missing-timestamp" not in out["degraded_causes"] and out["totals"]["missing_ts"] > 0:
            out["degraded_causes"].append("missing-timestamp")

    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
