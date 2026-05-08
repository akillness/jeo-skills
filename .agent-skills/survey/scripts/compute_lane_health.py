#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def _status(d):
    # backward/forward compatibility across evidence schema revisions
    return d.get("status") or d.get("lane_status") or ""


def _degraded_causes(d, raw_count):
    causes = list(d.get("degraded_causes", []))
    if raw_count == 0 and "no-results" not in causes:
        causes.append("no-results")
    return sorted(set(causes))


if len(sys.argv) != 2:
    sys.stderr.write("Usage: compute_lane_health.py .survey/<slug>/evidence.json\n")
    sys.exit(2)

p = Path(sys.argv[1])
obj = json.loads(p.read_text())
lanes = obj.get("lanes", {})

print("lane,raw_count,kept_count,zero_star_raw,median_stars_raw,status,degraded_causes,integrity")
for lane, d in lanes.items():
    raw_count = int(d.get("raw_count", 0) or 0)
    kept_count = int(d.get("kept_count", 0) or 0)
    zero_star_raw = int(d.get("zero_star_raw", 0) or 0)
    median = d.get("median_stars_raw", 0)
    status = _status(d)
    causes = _degraded_causes(d, raw_count)

    integrity = "ok"
    if kept_count > raw_count:
        integrity = "invalid-kept-gt-raw"
    elif zero_star_raw > raw_count:
        integrity = "invalid-zero-star-gt-raw"

    print("{},{},{},{},{},{},{},{}".format(
        lane,
        raw_count,
        kept_count,
        zero_star_raw,
        median,
        status,
        '|'.join(causes),
        integrity,
    ))
