#!/usr/bin/env python3
"""Validate hourly lane-queries.json for mandatory lanes and stage coverage.

Usage:
  python3 .agent-skills/survey/scripts/validate_hourly_lane_queries.py \
    .survey/<slug>/lane-queries.json .survey/<slug>/lane-queries-validation.json
"""

import json
import os
import sys

REQUIRED = {
    "agentic-ai-skill": "agentic ai skill",
    "web-frontend-skill": "web frontend skill",
    "web-backend-skill": "web backend skill",
    "cli-open-source-skill": "cli open source skill",
    "game-development-skill": "game development skill",
}


def fail(msg, output_path):
    payload = {"status": "fail", "errors": [msg]}
    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.write("\n")
    sys.stderr.write(msg + "\n")
    raise SystemExit(1)


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("usage: validate_hourly_lane_queries.py <lane-queries.json> <output.json>\n")
        raise SystemExit(2)

    input_path = argv[1]
    output_path = argv[2]
    if not os.path.isfile(input_path):
        fail("missing lane-queries file: {}".format(input_path), output_path)

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes", {})
    errors = []
    summary = {}

    for lane_key, phrase in REQUIRED.items():
        lane = lanes.get(lane_key)
        if not isinstance(lane, dict):
            errors.append("missing required lane: {}".format(lane_key))
            continue
        s0 = (lane.get("stage-0") or "").strip().lower()
        s1 = (lane.get("stage-1") or "").strip().lower()
        s2 = (lane.get("stage-2") or "").strip().lower()
        if not s0:
            errors.append("{} missing stage-0".format(lane_key))
        if not s1:
            errors.append("{} missing stage-1".format(lane_key))
        if not s2:
            errors.append("{} missing stage-2".format(lane_key))
        if phrase not in s0:
            errors.append("{} stage-0 must include mandatory query phrase '{}'".format(lane_key, phrase))
        summary[lane_key] = {"stage-0": bool(s0), "stage-1": bool(s1), "stage-2": bool(s2)}

    payload = {
        "status": "pass" if not errors else "fail",
        "required_lane_count": len(REQUIRED),
        "discovered_lane_count": len(lanes),
        "summary": summary,
        "errors": errors,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if errors:
        for e in errors:
            sys.stderr.write(e + "\n")
        raise SystemExit(1)

    print("hourly lane query contract: PASS")


if __name__ == "__main__":
    main(sys.argv)
