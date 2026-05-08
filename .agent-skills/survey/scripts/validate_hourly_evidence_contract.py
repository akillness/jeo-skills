#!/usr/bin/env python3
import json
import sys
from pathlib import Path

REQUIRED_LANES = [
    "agentic-ai-skill",
    "web-frontend-skill",
    "web-backend-skill",
    "cli-open-source-skill",
    "game-development-skill",
]


def fail(msg):
    sys.stderr.write(msg + "\n")
    sys.exit(1)


if len(sys.argv) != 2:
    sys.stderr.write("Usage: validate_hourly_evidence_contract.py .survey/<slug>/evidence.json\n")
    sys.exit(2)

p = Path(sys.argv[1])
if not p.exists():
    fail("missing evidence file: {}".format(p))

obj = json.loads(p.read_text())
lanes = obj.get("lanes")
if not isinstance(lanes, dict):
    fail("evidence missing lanes map")

errors = []
for lane in REQUIRED_LANES:
    d = lanes.get(lane)
    if not isinstance(d, dict):
        errors.append("missing required lane: {}".format(lane))
        continue

    raw_count = int(d.get("raw_count", 0) or 0)
    kept_count = int(d.get("kept_count", 0) or 0)
    zero_star_raw = int(d.get("zero_star_raw", 0) or 0)
    degraded_causes = list(d.get("degraded_causes", []))
    recov = list(d.get("recovery_queries", []))

    if kept_count > raw_count:
        errors.append("{} kept_count > raw_count".format(lane))
    if zero_star_raw > raw_count:
        errors.append("{} zero_star_raw > raw_count".format(lane))

    if raw_count == 0:
        if len(recov) < 2:
            errors.append("{} raw_count==0 but missing stage-1/2 recovery queries".format(lane))
        if "no-results" not in degraded_causes:
            errors.append("{} raw_count==0 but missing degraded cause no-results".format(lane))

single_lane_concentration = obj.get("single_lane_concentration")
recommended_lane_count = int(obj.get("recommended_lane_count", 0) or 0)
if recommended_lane_count < 2 and single_lane_concentration is not True:
    errors.append("recommended_lane_count < 2 requires single_lane_concentration=true")

if errors:
    for e in errors:
        sys.stderr.write("ERROR: {}\n".format(e))
    sys.exit(1)

print("OK: hourly evidence contract validated")
