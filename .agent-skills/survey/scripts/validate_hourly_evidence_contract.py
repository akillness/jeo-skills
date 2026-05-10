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
    if len(sys.argv) != 2:
        sys.stderr.write("usage: validate_hourly_evidence_contract.py <evidence.json>\n")
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        sys.stderr.write("missing file: {}\n".format(path))
        return 2

    data = json.loads(path.read_text(encoding="utf-8"))
    lanes = data.get("lanes", {})

    checks = []
    ok = True

    for lane in REQUIRED_LANES:
        lane_obj = lanes.get(lane)
        if not isinstance(lane_obj, dict):
            checks.append({"check": "lane:{}".format(lane), "ok": False, "detail": "missing lane"})
            ok = False
            continue

        raw_count = lane_obj.get("raw_count", 0)
        kept_count = lane_obj.get("kept_count", 0)
        if kept_count > raw_count:
            checks.append({"check": "metrics:{}".format(lane), "ok": False, "detail": "kept_count > raw_count"})
            ok = False
        else:
            checks.append({"check": "metrics:{}".format(lane), "ok": True, "detail": "counts valid"})

        rq = lane_obj.get("recovery_queries", [])
        stages = set()
        if isinstance(rq, list):
            for item in rq:
                if isinstance(item, dict) and item.get("stage"):
                    stages.add(item.get("stage"))

        has_stage1 = "stage-1" in stages
        has_stage2 = "stage-2" in stages
        stage_ok = has_stage1 and has_stage2
        checks.append({
            "check": "recovery:{}".format(lane),
            "ok": stage_ok,
            "detail": "stages={}".format(sorted(stages)),
        })
        if not stage_ok:
            ok = False

    out = {"ok": ok, "checks": checks, "required_lanes": REQUIRED_LANES}
    print(json.dumps(out, indent=2))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
