#!/usr/bin/env python3
"""Validate consistency between open-pr blocker artifacts and CI readiness output.

Usage:
  python3 check_open_pr_blocker_consistency.py <survey_dir> <output_json>
"""

import json
import os
import sys


def _read_json(path):
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main(argv):
    if len(argv) != 2:
        sys.stderr.write("usage: check_open_pr_blocker_consistency.py <survey_dir> <output_json>\n")
        return 2

    survey_dir = argv[0]
    output_json = argv[1]

    blocker_path = os.path.join(survey_dir, "open-pr-blocker.json")
    blocker_md_path = os.path.join(survey_dir, "open-pr-blocker.md")
    readiness_path = os.path.join(survey_dir, "ci-bootstrap-readiness.json")

    result = {
        "status": "pass",
        "issues": [],
        "checked_files": {
            "open-pr-blocker.json": os.path.isfile(blocker_path),
            "open-pr-blocker.md": os.path.isfile(blocker_md_path),
            "ci-bootstrap-readiness.json": os.path.isfile(readiness_path),
        },
    }

    blocker = _read_json(blocker_path)
    readiness = _read_json(readiness_path)

    if blocker is None:
        result["status"] = "degraded"
        result["issues"].append("missing-open-pr-blocker-json")
    if not os.path.isfile(blocker_md_path):
        result["status"] = "degraded"
        result["issues"].append("missing-open-pr-blocker-md")
    if readiness is None:
        result["status"] = "degraded"
        result["issues"].append("missing-ci-bootstrap-readiness")

    if blocker is not None:
        required = ["merge_blocked_reason", "remediation", "pr_number", "branch", "commit_sha"]
        for key in required:
            if key not in blocker:
                result["status"] = "degraded"
                result["issues"].append("blocker-missing-key:{}".format(key))

        remediation = blocker.get("remediation", [])
        if not isinstance(remediation, list) or len(remediation) < 3:
            result["status"] = "degraded"
            result["issues"].append("blocker-remediation-too-short")

    if blocker is not None and readiness is not None:
        blocker_reason = blocker.get("merge_blocked_reason")
        readiness_reason = readiness.get("merge_blocked_reason")
        if blocker_reason and readiness_reason and blocker_reason != readiness_reason:
            result["status"] = "degraded"
            result["issues"].append("reason-mismatch:{}!={}".format(blocker_reason, readiness_reason))

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(output_json)
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
