#!/usr/bin/env python3
import json
import os
import sys

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


def main(argv):
    if len(argv) != 2:
        return fail("usage: validate_hourly_evidence_contract.py <evidence.json>")
    path = argv[1]
    if not os.path.exists(path):
        return fail("missing evidence file: {0}".format(path))

    data = json.load(open(path, "r"))
    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        return fail("invalid contract: lanes map missing")

    rc = 0
    for lane in REQUIRED_LANES:
        if lane not in lanes:
            sys.stderr.write("missing lane: {0}\n".format(lane))
            rc = 1
            continue
        obj = lanes[lane]
        for key in ["raw_count", "kept_count", "recovery_queries", "lane_status", "degraded_causes"]:
            if key not in obj:
                sys.stderr.write("lane {0} missing key: {1}\n".format(lane, key))
                rc = 1
        rq = obj.get("recovery_queries")
        if not isinstance(rq, list):
            sys.stderr.write("lane {0} recovery_queries must be list\n".format(lane))
            rc = 1
        else:
            stages = []
            for item in rq:
                if isinstance(item, dict):
                    stages.append(item.get("stage"))
            if "stage-1" not in stages or "stage-2" not in stages:
                sys.stderr.write("lane {0} recovery_queries must include stage-1 and stage-2\n".format(lane))
                rc = 1
        raw_count = obj.get("raw_count", 0)
        kept_count = obj.get("kept_count", 0)
        try:
            if int(kept_count) > int(raw_count):
                sys.stderr.write("lane {0} invalid metrics: kept_count > raw_count\n".format(lane))
                rc = 1
        except Exception:
            sys.stderr.write("lane {0} invalid metric types\n".format(lane))
            rc = 1
        if int(raw_count) == 0:
            causes = obj.get("degraded_causes") or []
            if "no-results" not in causes:
                sys.stderr.write("lane {0} raw_count=0 must include degraded cause no-results\n".format(lane))
                rc = 1

    if rc == 0:
        sys.stdout.write("hourly evidence contract: OK\n")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
