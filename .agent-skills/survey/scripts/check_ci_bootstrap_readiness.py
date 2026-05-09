#!/usr/bin/env python3
import json
import os
import subprocess
import sys


def run(cmd):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = p.communicate()
    return p.returncode, out.strip(), err.strip()


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: check_ci_bootstrap_readiness.py <repo> <output_json>\n")
        return 2

    repo = sys.argv[1]
    output_path = sys.argv[2]

    checks = []

    rc, out, err = run(["gh", "workflow", "list", "--repo", repo, "--json", "name,path,state"])
    if rc != 0:
        checks.append({
            "name": "workflow_list_access",
            "status": "fail",
            "detail": err or out or "unable to list workflows"
        })
        payload = {
            "repo": repo,
            "status": "degraded",
            "merge_blocked_reason": "workflow-discovery-failed",
            "checks": checks,
            "remediation": [
                "Ensure gh auth is valid: gh auth status",
                "Ensure repo Actions permissions allow workflow reads"
            ]
        }
    else:
        workflows = []
        try:
            workflows = json.loads(out)
        except Exception:
            workflows = []

        active = [w for w in workflows if str(w.get("state", "")).lower() == "active"]
        checks.append({
            "name": "workflow_files_present",
            "status": "pass" if len(workflows) > 0 else "fail",
            "count": len(workflows)
        })
        checks.append({
            "name": "active_workflow_present",
            "status": "pass" if len(active) > 0 else "fail",
            "count": len(active)
        })

        missing = []
        if len(workflows) == 0:
            missing.append("No GitHub Actions workflow files detected")
        if len(active) == 0:
            missing.append("No active workflow detected")

        payload = {
            "repo": repo,
            "status": "pass" if len(missing) == 0 else "degraded",
            "merge_blocked_reason": "no-checks-reported" if len(missing) > 0 else "none",
            "checks": checks,
            "remediation": [
                "Add at least one workflow in .github/workflows/*.yml",
                "Trigger workflow via push or workflow_dispatch",
                "Require status checks in branch protection"
            ] if len(missing) > 0 else []
        }

    parent = os.path.dirname(output_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print("wrote {0}".format(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
