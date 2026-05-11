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

def main():
    if len(sys.argv) != 2:
        return fail("usage: validate_hourly_evidence_contract.py <evidence.json>")

    path = sys.argv[1]
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return fail("failed to read json: {}".format(e))

    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        return fail("missing or invalid 'lanes' map")

    for lane in REQUIRED_LANES:
        if lane not in lanes:
            return fail("missing lane: {}".format(lane))
        lane_obj = lanes[lane]
        rq = lane_obj.get("recovery_queries")
        if not isinstance(rq, list):
            return fail("lane {} missing recovery_queries list".format(lane))
        stages = set()
        for item in rq:
            if isinstance(item, dict) and "stage" in item:
                stages.add(item["stage"])
        if "stage-1" not in stages or "stage-2" not in stages:
            return fail("lane {} missing stage-1/stage-2 recovery coverage".format(lane))
        raw_count = lane_obj.get("raw_count")
        kept_count = lane_obj.get("kept_count")
        if isinstance(raw_count, int) and isinstance(kept_count, int) and kept_count > raw_count:
            return fail("lane {} has impossible metric kept_count > raw_count".format(lane))

    print("ok: hourly evidence contract valid")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
