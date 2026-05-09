#!/usr/bin/env python3
"""Validate hourly builder runtime prerequisites and outputs.

Usage:
  python3 .agent-skills/survey/scripts/validate_hourly_builder_runtime.py .survey/<slug>
"""

import json
import os
import py_compile
import sys


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: validate_hourly_builder_runtime.py <survey-dir>\n")
        return 2

    survey_dir = sys.argv[1]
    evidence_path = os.path.join(survey_dir, "evidence.json")
    lane_queries_path = os.path.join(survey_dir, "lane-queries.json")
    builder_path = ".agent-skills/survey/scripts/build_hourly_evidence.py"

    checks = []

    try:
        py_compile.compile(builder_path, doraise=True)
        checks.append({"check": "builder_py_compile", "ok": True})
    except Exception as exc:
        checks.append({"check": "builder_py_compile", "ok": False, "error": str(exc)})

    checks.append({"check": "survey_dir_exists", "ok": os.path.isdir(survey_dir)})
    checks.append({"check": "lane_queries_exists", "ok": os.path.isfile(lane_queries_path)})
    checks.append({"check": "evidence_exists", "ok": os.path.isfile(evidence_path)})

    lane_keys_ok = False
    recovery_stage_ok = False
    if os.path.isfile(evidence_path):
        try:
            with open(evidence_path, "r", encoding="utf-8") as f:
                evidence = json.load(f)
            lanes = evidence.get("lanes") or {}
            required = {
                "agentic-ai-skill",
                "web-frontend-skill",
                "web-backend-skill",
                "cli-open-source-skill",
                "game-development-skill",
            }
            lane_keys_ok = set(lanes.keys()) == required
            recovery_stage_ok = True
            for lane_name in required:
                rec = lanes.get(lane_name, {}).get("recovery_queries") or []
                stages = {x.get("stage") for x in rec if isinstance(x, dict)}
                if "stage-1" not in stages or "stage-2" not in stages:
                    recovery_stage_ok = False
                    break
        except Exception:
            lane_keys_ok = False
            recovery_stage_ok = False

    checks.append({"check": "lane_keys_exact", "ok": lane_keys_ok})
    checks.append({"check": "recovery_stage12_present", "ok": recovery_stage_ok})

    failed = [c for c in checks if not c.get("ok")]
    payload = {
        "survey_dir": survey_dir,
        "ok": len(failed) == 0,
        "checks": checks,
    }

    out_json = os.path.join(survey_dir, "builder-runtime-validation.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    out_md = os.path.join(survey_dir, "builder-runtime-validation.md")
    lines = ["# Builder Runtime Validation", "", "- survey_dir: {}".format(survey_dir), "- overall: {}".format("PASS" if payload["ok"] else "FAIL"), ""]
    for c in checks:
        lines.append("- {}: {}".format(c["check"], "OK" if c.get("ok") else "FAIL"))
    if failed:
        lines.append("")
        lines.append("## Failures")
        for c in failed:
            lines.append("- {} :: {}".format(c["check"], c.get("error", "condition not met")))
    with open(out_md, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(json.dumps(payload))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
