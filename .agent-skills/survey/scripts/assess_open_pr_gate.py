#!/usr/bin/env python3
import json
import subprocess
import sys


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: assess_open_pr_gate.py <repo>\n")
        return 2
    repo = sys.argv[1]
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
        "prs": prs,
        "checks_degraded": False,
        "merge_candidates": [],
        "blocked_prs": []
    }
    for pr in prs:
        prn = str(pr.get("number"))
        crc, cout, cerr = run(["gh", "pr", "checks", prn, "--repo", repo])
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
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
