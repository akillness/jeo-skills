#!/usr/bin/env python3
"""Collect gh pr checks transcripts into a survey slug directory.

Usage:
  python3 collect_open_pr_checks_artifacts.py <checks_out> <checks_err> <slug_dir>
"""

import json
import os
import shutil
import sys
from datetime import datetime, timezone


def main():
    if len(sys.argv) != 4:
        sys.stderr.write(
            "Usage: collect_open_pr_checks_artifacts.py <checks_out> <checks_err> <slug_dir>\n"
        )
        return 2

    checks_out = sys.argv[1]
    checks_err = sys.argv[2]
    slug_dir = sys.argv[3]

    if not os.path.isfile(checks_out):
        sys.stderr.write("missing checks_out: {}\n".format(checks_out))
        return 2
    if not os.path.isfile(checks_err):
        sys.stderr.write("missing checks_err: {}\n".format(checks_err))
        return 2
    if not os.path.isdir(slug_dir):
        sys.stderr.write("missing slug_dir: {}\n".format(slug_dir))
        return 2

    out_dst = os.path.join(slug_dir, "open-pr-checks.out")
    err_dst = os.path.join(slug_dir, "open-pr-checks.err")
    shutil.copyfile(checks_out, out_dst)
    shutil.copyfile(checks_err, err_dst)

    err_text = ""
    with open(err_dst, "r", encoding="utf-8", errors="replace") as f:
        err_text = f.read().strip()

    status = "ok"
    merge_blocked_reason = ""
    if "no checks reported" in err_text.lower():
        status = "blocked"
        merge_blocked_reason = "no-checks-reported"

    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "checks_out": os.path.basename(out_dst),
        "checks_err": os.path.basename(err_dst),
        "status": status,
        "merge_blocked_reason": merge_blocked_reason,
    }

    summary_path = os.path.join(slug_dir, "open-pr-checks-summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(summary_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
