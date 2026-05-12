#!/usr/bin/env python3
"""Validate hourly delivery-report format requirements.

Checks:
- Top section includes development/progress contribution bullets
- Maintenance-only section exists
- Final section states merge decision and blocker status
"""

import json
import os
import re
import sys


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: check_final_report_format.py <survey_dir> <output_json>\n")
        return 2

    survey_dir = sys.argv[1]
    output_json = sys.argv[2]
    report_path = os.path.join(survey_dir, "delivery-report.md")

    result = {
        "status": "pass",
        "checks": {},
        "merge_blocked_reason": "",
    }

    if not os.path.isfile(report_path):
        result["status"] = "degraded"
        result["checks"]["delivery_report_exists"] = False
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            f.write("\n")
        return 1

    text = open(report_path, "r", encoding="utf-8").read()
    lines = text.splitlines()

    top_chunk = "\n".join(lines[:60])
    top_has_dev_heading = any(
        marker in top_chunk.lower()
        for marker in [
            "development contributions",
            "development/progress contributions",
            "개발/발전 기여",
            "개발 기여",
        ]
    )
    dev_bullets = re.findall(r"^\s*[-*]\s+.*", top_chunk, flags=re.M)
    result["checks"]["top_has_dev_heading"] = top_has_dev_heading
    result["checks"]["top_has_dev_bullets"] = len(dev_bullets) >= 1

    maintenance_markers = ["maintenance", "유지보수", "Maintenance Changes"]
    result["checks"]["has_maintenance_section"] = any(m.lower() in text.lower() for m in maintenance_markers)

    tail = "\n".join(lines[-60:])
    merge_markers = ["merge", "머지", "merged", "not merged", "blocker"]
    result["checks"]["tail_has_merge_and_blocker"] = (
        ("merge" in tail.lower() or "머지" in tail) and ("blocker" in tail.lower() or "차단" in tail)
    )

    if not all(result["checks"].values()):
        result["status"] = "degraded"
        if not result["checks"].get("tail_has_merge_and_blocker"):
            result["merge_blocked_reason"] = "delivery-report-missing-merge-blocker-status"

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")

    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
