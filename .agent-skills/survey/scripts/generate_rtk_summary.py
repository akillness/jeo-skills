#!/usr/bin/env python3
"""Generate RTK summary markdown for hourly evidence with safe fallback.

Usage:
  python3 .agent-skills/survey/scripts/generate_rtk_summary.py \
    .survey/<slug>/evidence.json .survey/<slug>/rtk-summary.md
"""

import argparse
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone


def _load_metrics(evidence_path):
    with open(evidence_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    lanes = data.get("lanes", {})
    rows = []
    for lane, payload in lanes.items():
        rows.append({
            "lane": lane,
            "raw": int(payload.get("raw_count", 0) or 0),
            "kept": int(payload.get("kept_count", 0) or 0),
            "zero_star_raw": int(payload.get("zero_star_raw", 0) or 0),
            "median_stars_raw": payload.get("median_stars_raw", 0),
            "status": payload.get("lane_status", "unknown"),
            "causes": payload.get("degraded_causes", []) or [],
        })
    return rows


def _render_metrics(rows):
    lines = []
    lines.append("Hourly lane metrics")
    for r in rows:
        causes = ",".join(r["causes"]) if r["causes"] else "none"
        lines.append(
            "- lane={lane} raw={raw} kept={kept} zero_star_raw={zero} median_stars_raw={median} status={status} degraded_causes={causes}".format(
                lane=r["lane"],
                raw=r["raw"],
                kept=r["kept"],
                zero=r["zero_star_raw"],
                median=r["median_stars_raw"],
                status=r["status"],
                causes=causes,
            )
        )
    return "\n".join(lines) + "\n"


def _fallback_markdown(rows, rtk_error=None):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    out = ["# RTK Summary (fallback)", "", "Generated at: {}".format(ts), ""]
    if rtk_error:
        out.extend([
            "RTK execution degraded.",
            "- reason: {}".format(rtk_error.strip().replace("\n", " | ")),
            "",
        ])
    out.extend([
        "## Lane Snapshot",
        "",
        "| lane | raw | kept | zero_star_raw | median_stars_raw | status | degraded_causes |",
        "|---|---:|---:|---:|---:|---|---|",
    ])
    for r in rows:
        out.append(
            "| {lane} | {raw} | {kept} | {zero} | {median} | {status} | {causes} |".format(
                lane=r["lane"],
                raw=r["raw"],
                kept=r["kept"],
                zero=r["zero_star_raw"],
                median=r["median_stars_raw"],
                status=r["status"],
                causes=", ".join(r["causes"]) if r["causes"] else "none",
            )
        )
    out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("evidence_json")
    ap.add_argument("output_md")
    args = ap.parse_args()

    rows = _load_metrics(args.evidence_json)
    metrics_text = _render_metrics(rows)

    temp_dir = tempfile.mkdtemp(prefix="rtk-hourly-")
    metrics_path = os.path.join(temp_dir, "lane-metrics.txt")
    with open(metrics_path, "w", encoding="utf-8") as f:
        f.write(metrics_text)

    cmd = ["rtk", "summary", "cat {}".format(metrics_path)]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    if proc.returncode == 0 and proc.stdout.strip():
        with open(args.output_md, "w", encoding="utf-8") as f:
            f.write(proc.stdout)
            if not proc.stdout.endswith("\n"):
                f.write("\n")
        print("ok")
        return

    fallback = _fallback_markdown(rows, rtk_error=proc.stderr or "empty rtk output")
    with open(args.output_md, "w", encoding="utf-8") as f:
        f.write(fallback)
        if not fallback.endswith("\n"):
            f.write("\n")
    print("degraded")


if __name__ == "__main__":
    main()
