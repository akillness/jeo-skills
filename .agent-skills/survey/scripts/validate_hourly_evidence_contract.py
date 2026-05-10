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


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: validate_hourly_evidence_contract.py <evidence.json>\n")
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        sys.stderr.write("missing file: {}\n".format(path))
        return 1

    data = json.loads(path.read_text(encoding="utf-8"))
    lanes = data.get("lanes")
    if not isinstance(lanes, dict):
        sys.stderr.write("invalid contract: missing lanes object\n")
        return 1

    ok = True
    for lane in REQUIRED_LANES:
        lane_obj = lanes.get(lane)
        if not isinstance(lane_obj, dict):
            sys.stderr.write("missing lane: {}\n".format(lane))
            ok = False
            continue

        rq = lane_obj.get("recovery_queries")
        if not isinstance(rq, list):
            sys.stderr.write("lane {} missing recovery_queries list\n".format(lane))
            ok = False
            continue

        stages = set()
        for row in rq:
            if isinstance(row, dict):
                stage = row.get("stage")
                if stage:
                    stages.add(stage)

        if "stage-1" not in stages or "stage-2" not in stages:
            sys.stderr.write("lane {} missing stage-1/stage-2 coverage\n".format(lane))
            ok = False

        raw = lane_obj.get("raw_count")
        kept = lane_obj.get("kept_count")
        if isinstance(raw, int) and isinstance(kept, int) and kept > raw:
            sys.stderr.write("lane {} invalid counts: kept_count > raw_count\n".format(lane))
            ok = False

    if not ok:
        return 1

    print(json.dumps({"ok": True, "checked_lanes": REQUIRED_LANES}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
