#!/usr/bin/env python3
import argparse
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
    parser = argparse.ArgumentParser(description="Validate hourly evidence contract")
    parser.add_argument("evidence_json", help="Path to evidence.json")
    args = parser.parse_args()

    with open(args.evidence_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    errors = []
    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        errors.append("missing lanes map")
        lanes = {}

    for lane in REQUIRED_LANES:
        if lane not in lanes:
            errors.append("missing lane: {}".format(lane))
            continue
        item = lanes[lane]
        raw_count = item.get("raw_count", 0)
        kept_count = item.get("kept_count", 0)
        if kept_count > raw_count:
            errors.append("lane {} has kept_count > raw_count".format(lane))
        recovery = item.get("recovery_queries")
        if not isinstance(recovery, list):
            errors.append("lane {} missing recovery_queries".format(lane))
            continue
        stages = set()
        for r in recovery:
            if isinstance(r, dict) and "stage" in r:
                stages.add(r["stage"])
        for need in ("stage-1", "stage-2"):
            if need not in stages:
                errors.append("lane {} missing {} recovery entry".format(lane, need))
        if raw_count == 0:
            causes = item.get("degraded_causes") or []
            if "no-results" not in causes:
                errors.append("lane {} raw_count=0 but degraded_causes lacks no-results".format(lane))

    extra = sorted([k for k in lanes.keys() if k not in REQUIRED_LANES])
    if extra:
        errors.append("unexpected lane keys: {}".format(", ".join(extra)))

    if errors:
        for e in errors:
            sys.stderr.write("ERROR: {}\n".format(e))
        return 1
    print("hourly evidence contract: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
