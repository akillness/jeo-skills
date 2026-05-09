#!/usr/bin/env python3
import json
import sys

REQUIRED = [
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
    p = sys.argv[1]
    data = json.load(open(p))
    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        return fail("missing lanes map")
    for key in REQUIRED:
        if key not in lanes:
            return fail("missing lane key: {0}".format(key))
        lane = lanes[key]
        rc = lane.get("raw_count", 0)
        kc = lane.get("kept_count", 0)
        if kc > rc:
            return fail("invalid counts for {0}: kept_count > raw_count".format(key))
        rq = lane.get("recovery_queries")
        if not isinstance(rq, list):
            return fail("missing recovery_queries for {0}".format(key))
        stages = set([x.get("stage") for x in rq if isinstance(x, dict)])
        if "stage-1" not in stages or "stage-2" not in stages:
            return fail("recovery_queries must include stage-1 and stage-2 for {0}".format(key))
        if rc == 0:
            causes = lane.get("degraded_causes") or []
            if "no-results" not in causes:
                return fail("raw_count == 0 requires degraded_causes include no-results for {0}".format(key))
    print("hourly evidence contract: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
