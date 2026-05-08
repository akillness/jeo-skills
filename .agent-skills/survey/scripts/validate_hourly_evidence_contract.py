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
    sys.stderr.write("[hourly-evidence-contract] ERROR: {}\n".format(msg))
    return 1


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("Usage: {} <evidence.json>\n".format(sys.argv[0]))
        return 2

    path = sys.argv[1]
    if not os.path.exists(path):
        return fail("file not found: {}".format(path))

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return fail("cannot parse json: {}".format(e))

    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        return fail("missing object key: lanes")

    for lane in REQUIRED_LANES:
        if lane not in lanes:
            return fail("missing lane key: {}".format(lane))

    for lane in REQUIRED_LANES:
        item = lanes[lane]
        for key in ["raw_count", "zero_star_raw", "median_stars_raw", "kept_count", "recovery_queries"]:
            if key not in item:
                return fail("lane {} missing key: {}".format(lane, key))

        raw_count = int(item.get("raw_count", 0) or 0)
        kept_count = int(item.get("kept_count", 0) or 0)
        zero_star_raw = int(item.get("zero_star_raw", 0) or 0)
        median_stars_raw = item.get("median_stars_raw", 0) or 0

        if kept_count > raw_count:
            return fail("lane {} integrity violation: kept_count > raw_count".format(lane))
        if raw_count == 0 and (zero_star_raw != 0 or float(median_stars_raw) != 0.0):
            return fail("lane {} integrity violation: raw_count=0 requires zero_star_raw=0 and median_stars_raw=0".format(lane))

        rq = item.get("recovery_queries")
        if not isinstance(rq, list):
            return fail("lane {} recovery_queries must be a list".format(lane))

        stages = set()
        for q in rq:
            if isinstance(q, dict) and "stage" in q:
                stages.add(str(q.get("stage")))

        if "stage1" not in stages or "stage2" not in stages:
            return fail("lane {} recovery_queries must include stage1 and stage2".format(lane))

        if raw_count == 0:
            causes = item.get("degraded_causes", [])
            if "no-results" not in causes:
                return fail("lane {} with raw_count=0 must include degraded_causes:no-results".format(lane))

    sys.stdout.write("hourly evidence contract valid\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
