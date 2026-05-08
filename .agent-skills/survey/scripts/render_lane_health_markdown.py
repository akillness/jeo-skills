#!/usr/bin/env python3
import json
import sys


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: render_lane_health_markdown.py <evidence.json> <output.md>\n")
        return 2

    evidence_path = sys.argv[1]
    out_path = sys.argv[2]

    with open(evidence_path, "r") as f:
        data = json.load(f)

    lanes = data.get("lanes", {})
    lines = []
    lines.append("# Lane Health Summary")
    lines.append("")
    lines.append("| Lane | raw_count | kept_count | zero_star_raw | median_stars_raw | lane_status | degraded_causes |")
    lines.append("|------|-----------|------------|---------------|------------------|-------------|-----------------|")

    for lane_name in sorted(lanes.keys()):
        lane = lanes.get(lane_name, {})
        raw_count = lane.get("raw_count", 0)
        kept_count = lane.get("kept_count", 0)
        zero_star = lane.get("zero_star_raw", 0)
        median_stars = lane.get("median_stars_raw", 0)
        status = lane.get("lane_status", "unknown")
        causes = ",".join(lane.get("degraded_causes", []))
        lines.append("| {0} | {1} | {2} | {3} | {4} | {5} | {6} |".format(
            lane_name,
            raw_count,
            kept_count,
            zero_star,
            median_stars,
            status,
            causes
        ))

    lines.append("")
    lines.append("Provenance: indexed snippet, feed recovery")

    with open(out_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
