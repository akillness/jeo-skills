#!/usr/bin/env python3
"""
Gate helper for hourly survey runs.

Purpose:
- Fail when a run only changes survey artifacts/formatting without any
  reusable functional or procedural improvement.
- Keep unattended PRs aligned with development-first policy.

Usage:
  python3 check_substantive_hourly_change.py <git-status-short-file> <output-json>

Exit codes:
  0: pass
  1: fail
  2: usage/input error
"""

import json
import os
import sys


def load_status_lines(path):
    if not os.path.exists(path):
        raise ValueError("missing status file: {0}".format(path))
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if line.strip():
                out.append(line)
    return out


def parse_path(status_line):
    # git status --short format: XY <path>
    # Handle rename format: R  old -> new
    if len(status_line) < 4:
        return ""
    payload = status_line[3:]
    if " -> " in payload:
        payload = payload.split(" -> ", 1)[1]
    return payload.strip()


def classify(paths):
    reusable = []
    survey_only = []

    for p in paths:
        if p.startswith(".survey/"):
            survey_only.append(p)
            continue

        if p.startswith(".agent-skills/survey/scripts/"):
            reusable.append(p)
            continue
        if p.startswith(".agent-skills/survey/references/"):
            reusable.append(p)
            continue
        if p.startswith(".agent-skills/survey/templates/"):
            reusable.append(p)
            continue
        if p.startswith(".agent-skills/survey/SKILL.") or p.endswith("/SKILL.md") or p.endswith("/SKILL.toon"):
            reusable.append(p)
            continue
        if p.endswith("evals/evals.json"):
            reusable.append(p)
            continue

        # non-survey change outside known buckets still counts as substantive
        reusable.append(p)

    return reusable, survey_only


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("usage: python3 check_substantive_hourly_change.py <git-status-short-file> <output-json>\n")
        return 2

    status_file = argv[1]
    output_json = argv[2]

    try:
        lines = load_status_lines(status_file)
    except Exception as e:
        sys.stderr.write(str(e) + "\n")
        return 2

    paths = []
    for line in lines:
        p = parse_path(line)
        if p:
            paths.append(p)

    reusable, survey_only = classify(paths)
    passed = len(reusable) > 0

    result = {
        "status_file": status_file,
        "changed_count": len(paths),
        "reusable_change_count": len(reusable),
        "survey_only_change_count": len(survey_only),
        "reusable_changes": reusable,
        "survey_only_changes": survey_only,
        "pass": passed,
        "merge_blocked_reason": None if passed else "maintenance-only-diff",
        "remediation": [] if passed else [
            "Add at least one reusable script/template/reference or skill workflow update.",
            "Re-run validator after adding substantive procedural or functional improvement."
        ]
    }

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if passed:
        print("PASS: substantive change detected ({0})".format(len(reusable)))
        return 0

    print("FAIL: maintenance-only survey artifacts detected")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
