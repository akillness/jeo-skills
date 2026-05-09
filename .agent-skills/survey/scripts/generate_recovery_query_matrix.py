#!/usr/bin/env python3
import json
import os
import sys


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: generate_recovery_query_matrix.py <evidence.json> <output.md>\n")
        return 2

    evidence_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(evidence_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    lanes = data.get("lanes", {})
    lines = []
    lines.append("# Recovery Query Matrix")
    lines.append("")
    lines.append("| Lane | Stage | Query | Raw Count | Source |")
    lines.append("|---|---:|---|---:|---|")

    for lane_key in sorted(lanes.keys()):
        lane = lanes.get(lane_key, {})
        rec = lane.get("recovery_queries", [])
        if not rec:
            lines.append("| {0} | - | (missing) | 0 | none |".format(lane_key))
            continue
        for item in rec:
            stage = item.get("stage", "-")
            query = (item.get("query") or "").replace("|", "\\|")
            raw_count = item.get("raw_count", 0)
            source = item.get("source", "gh-search")
            lines.append("| {0} | {1} | {2} | {3} | {4} |".format(lane_key, stage, query, raw_count, source))

    lines.append("")
    lines.append("Generated from evidence for deterministic audit of stage-1/stage-2 recovery coverage.")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
