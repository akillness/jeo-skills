#!/usr/bin/env python3
"""Validate hourly evidence contract for oh-my-skills survey runs.
Usage: python3 validate_hourly_evidence_contract.py <evidence.json>
"""
import json
import sys

REQUIRED_LANES = [
    "agentic-ai-skill",
    "web-frontend-skill",
    "web-backend-skill",
    "cli-open-source-skill",
    "game-development-skill",
]


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: python3 validate_hourly_evidence_contract.py <evidence.json>\n")
        return 2
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes")
    errors = []
    if not isinstance(lanes, dict):
        errors.append("missing or invalid top-level 'lanes' map")
        lanes = {}

    for key in REQUIRED_LANES:
        lane = lanes.get(key)
        if lane is None:
            errors.append("missing lane: {}".format(key))
            continue
        if not isinstance(lane, dict):
            errors.append("lane is not object: {}".format(key))
            continue
        recovery = lane.get("recovery_queries")
        if not isinstance(recovery, list):
            errors.append("lane {} missing recovery_queries list".format(key))
            continue
        stages = set()
        for item in recovery:
            if isinstance(item, dict):
                stage = item.get("stage")
                if stage:
                    stages.add(stage)
        if "stage-1" not in stages or "stage-2" not in stages:
            errors.append("lane {} must include both stage-1 and stage-2 recovery queries".format(key))
        raw_count = lane.get("raw_count", 0)
        kept_count = lane.get("kept_count", 0)
        if isinstance(raw_count, int) and isinstance(kept_count, int) and kept_count > raw_count:
            errors.append("lane {} has impossible counts: kept_count > raw_count".format(key))

    if errors:
        for e in errors:
            sys.stderr.write("ERROR: {}\n".format(e))
        return 1

    print(json.dumps({"status": "pass", "checked_lanes": REQUIRED_LANES}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
