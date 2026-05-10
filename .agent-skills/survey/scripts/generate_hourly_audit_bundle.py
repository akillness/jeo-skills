#!/usr/bin/env python3
"""Generate a deterministic hourly audit bundle from .survey/<slug>/evidence.json.

Usage:
  python3 .agent-skills/survey/scripts/generate_hourly_audit_bundle.py .survey/<slug>
"""

import argparse
import json
import os
import subprocess
import sys


def run(cmd, capture_path=None):
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if capture_path is not None:
        with open(capture_path, "w", encoding="utf-8") as f:
            f.write(proc.stdout)
    if proc.returncode != 0:
        sys.stderr.write("command failed: {}\n".format(" ".join(cmd)))
        sys.stderr.write(proc.stderr)
        raise SystemExit(proc.returncode)
    return proc.stdout


def main():
    ap = argparse.ArgumentParser(description="Generate hourly survey audit bundle")
    ap.add_argument("survey_dir", help=".survey/<slug> directory")
    args = ap.parse_args()

    survey_dir = args.survey_dir.rstrip("/")
    evidence = os.path.join(survey_dir, "evidence.json")
    if not os.path.isfile(evidence):
        raise SystemExit("missing evidence.json: {}".format(evidence))

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    scripts = os.path.join(root, ".agent-skills", "survey", "scripts")

    run(["python3", os.path.join(scripts, "render_lane_health_markdown.py"), evidence, os.path.join(survey_dir, "lane-health.md")])
    run(["python3", os.path.join(scripts, "dedupe_hourly_recommendations.py"), evidence, os.path.join(survey_dir, "deduped-recommendations.json")])
    run(["python3", os.path.join(scripts, "compute_lane_health.py"), evidence], capture_path=os.path.join(survey_dir, "lane-health.json"))
    run(["python3", os.path.join(scripts, "generate_recovery_query_matrix.py"), evidence, os.path.join(survey_dir, "recovery-query-matrix.md")])
    run(["python3", os.path.join(scripts, "generate_lane_degradation_report.py"), evidence, os.path.join(survey_dir, "lane-degradation-report.md"), os.path.join(survey_dir, "lane-degradation-report.json")])
    run(["python3", os.path.join(scripts, "lane_quality_gate.py"), "--input", evidence, "--output", os.path.join(survey_dir, "lane-quality-gate.json")])
    run(["python3", os.path.join(scripts, "intent_fit_audit.py"), evidence], capture_path=os.path.join(survey_dir, "intent-fit-audit.json"))
    run(["python3", os.path.join(scripts, "audit_hourly_recommendation_quality.py"), evidence], capture_path=os.path.join(survey_dir, "recommendation-quality-audit.json"))
    run(["python3", os.path.join(scripts, "audit_freshness_window.py"), evidence], capture_path=os.path.join(survey_dir, "freshness-audit.json"))
    run(["python3", os.path.join(scripts, "generate_rtk_summary.py"), evidence, os.path.join(survey_dir, "rtk-summary.md")])
    run(["python3", os.path.join(scripts, "generate_hourly_run_report.py"), survey_dir, os.path.join(survey_dir, "run-report.md")])
    run(["python3", os.path.join(scripts, "generate_hourly_delivery_report.py"), survey_dir, os.path.join(survey_dir, "delivery-report.md")])

    with open(evidence, "r", encoding="utf-8") as f:
        data = json.load(f)
    lanes = data.get("lanes", {})
    summary = {
        "lane_count": len(lanes),
        "raw_total": sum(int(v.get("raw_count", 0) or 0) for v in lanes.values()),
        "kept_total": sum(int(v.get("kept_count", 0) or 0) for v in lanes.values()),
    }
    with open(os.path.join(survey_dir, "audit-bundle-summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print("OK: generated hourly audit bundle for {}".format(survey_dir))


if __name__ == "__main__":
    main()
