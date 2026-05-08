#!/usr/bin/env python3
import json
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
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return fail("failed to read json: {0}".format(e))

    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        return fail("missing or invalid 'lanes' object")

    rc = 0
    for lane in REQUIRED_LANES:
        if lane not in lanes:
            sys.stderr.write("missing lane: {0}\n".format(lane))
            rc = 1
            continue
        node = lanes[lane]
        rq = node.get("recovery_queries")
        if not isinstance(rq, list):
            sys.stderr.write("lane {0}: missing recovery_queries list\n".format(lane))
            rc = 1
            continue
        stages = set()
        for item in rq:
            if isinstance(item, dict) and item.get("stage"):
                stages.add(str(item.get("stage")))
        if "stage-1" not in stages or "stage-2" not in stages:
            sys.stderr.write("lane {0}: recovery_queries must include stage-1 and stage-2\n".format(lane))
            rc = 1

        raw = node.get("raw_count")
        kept = node.get("kept_count")
        if isinstance(raw, int) and isinstance(kept, int) and kept > raw:
            sys.stderr.write("lane {0}: kept_count > raw_count\n".format(lane))
            rc = 1

        if raw == 0:
            causes = node.get("degraded_causes") or []
            if "no-results" not in causes:
                sys.stderr.write("lane {0}: raw_count=0 requires degraded_causes to include no-results\n".format(lane))
                rc = 1

    if rc == 0:
        print("hourly evidence contract: OK")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
