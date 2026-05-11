#!/usr/bin/env python3
import json
import subprocess
import sys
from datetime import datetime, timezone


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def main():
    if len(sys.argv) != 5:
        sys.stderr.write(
            "usage: check_remote_branch_contains_commit.py <repo> <branch> <commit_sha> <output_json>\n"
        )
        return 2

    _repo = sys.argv[1]
    branch = sys.argv[2]
    commit = sys.argv[3]
    out_path = sys.argv[4]

    result = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "branch": branch,
        "commit_sha": commit,
        "status": "unknown",
        "remote_head_sha": None,
        "merge_blocked_reason": None,
        "details": {},
    }

    rc, _, err = run(["git", "fetch", "origin", branch])
    result["details"]["fetch_exit_code"] = rc
    if rc != 0:
        result["status"] = "degraded"
        result["merge_blocked_reason"] = "fetch-failed"
        result["details"]["fetch_error"] = err
    else:
        rc_head, head, err_head = run(["git", "rev-parse", "origin/{}".format(branch)])
        result["details"]["head_exit_code"] = rc_head
        result["remote_head_sha"] = head if rc_head == 0 else None
        if rc_head != 0:
            result["status"] = "degraded"
            result["merge_blocked_reason"] = "remote-head-unavailable"
            result["details"]["head_error"] = err_head
        else:
            rc_contains, _, _ = run(["git", "merge-base", "--is-ancestor", commit, "origin/{}".format(branch)])
            result["details"]["contains_exit_code"] = rc_contains
            if rc_contains == 0:
                result["status"] = "pass"
            else:
                result["status"] = "degraded"
                result["merge_blocked_reason"] = "remote-head-advanced"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if result["status"] != "pass":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
