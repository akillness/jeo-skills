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
    return 1

def main():
    if len(sys.argv) != 2:
        return fail("usage: validate_hourly_evidence_contract.py <evidence.json>")

    p = Path(sys.argv[1])
    if not p.exists():
        return fail("missing file: {}".format(p))

    try:
        data = json.loads(p.read_text())
    except Exception as e:
        return fail("invalid json: {}".format(e))

    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        return fail("missing lanes map")

    errors = []
    for lane in REQUIRED_LANES:
        if lane not in lanes:
            errors.append("missing lane: {}".format(lane))
            continue
        info = lanes[lane]
        raw_count = info.get("raw_count", 0)
        kept_count = info.get("kept_count", 0)
        if kept_count > raw_count:
            errors.append("impossible metrics {} kept_count({}) > raw_count({})".format(lane, kept_count, raw_count))

        rq = info.get("recovery_queries")
        if not isinstance(rq, list):
            errors.append("{} missing recovery_queries list".format(lane))
            continue

        stages = set([str(x.get("stage")) for x in rq if isinstance(x, dict)])
        if "stage-1" not in stages or "stage-2" not in stages:
            errors.append("{} requires stage-1 and stage-2 recovery entries".format(lane))

        if raw_count == 0:
            dc = info.get("degraded_causes") or []
            if "no-results" not in dc:
                errors.append("{} raw_count=0 must include degraded_cause no-results".format(lane))

    if errors:
        sys.stderr.write("contract validation failed:\n")
        for e in errors:
            sys.stderr.write("- {}\n".format(e))
        return 2

    print("ok: hourly evidence contract valid")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
