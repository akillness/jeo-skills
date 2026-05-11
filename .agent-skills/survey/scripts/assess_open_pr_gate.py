#!/usr/bin/env python3
import json
import subprocess
import sys


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: assess_open_pr_gate.py <repo> [backlog_threshold]\n")
        return 2
    repo = sys.argv[1]
    backlog_threshold = 10
    if len(sys.argv) >= 3:
        try:
            backlog_threshold = int(sys.argv[2])
        except ValueError:
            sys.stderr.write("invalid backlog_threshold: %s\n" % sys.argv[2])
            return 2
    rc, out, err = run([
        "gh", "pr", "list", "--repo", repo, "--state", "open",
        "--json", "number,title,headRefName,mergeStateStatus,url"
    ])
    if rc != 0:
        sys.stderr.write(err)
        return 1
    prs = json.loads(out)
    result = {
        "repo": repo,
        "open_pr_count": len(prs),
        "backlog_threshold": backlog_threshold,
        "backlog_high": len(prs) >= backlog_threshold,
        "prs": prs,
        "checks_degraded": False,
        "checks_sampled_count": 0,
        "mode_decision": "triage-open-prs",
        "merge_candidates": [],
        "blocked_prs": []
    }
    for pr in prs:
        prn = str(pr.get("number"))
        crc, cout, cerr = run(["gh", "pr", "checks", prn, "--repo", repo])
        result["checks_sampled_count"] += 1
        checks_text = (cout + "\n" + cerr).strip()
        no_checks = "no checks reported" in checks_text.lower()
        blocked = (pr.get("mergeStateStatus") not in ["CLEAN", "HAS_HOOKS"]) or no_checks or (crc != 0 and not no_checks)
        item = {
            "number": pr.get("number"),
            "url": pr.get("url"),
            "merge_state": pr.get("mergeStateStatus"),
            "checks_no_reported": no_checks,
            "checks_exit_code": crc,
            "checks_excerpt": checks_text[:500]
        }
        if blocked:
            result["blocked_prs"].append(item)
            if no_checks:
                result["checks_degraded"] = True
        else:
            result["merge_candidates"].append(item)

    if result["backlog_high"] and result["checks_degraded"]:
        result["mode_decision"] = "checks-degraded"
    elif result["open_pr_count"] > 0:
        result["mode_decision"] = "triage-open-prs"
    else:
        result["mode_decision"] = "create-new-pr"
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
