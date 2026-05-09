#!/usr/bin/env python3
import json
import os
import subprocess
import sys


def run(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def main():
    if len(sys.argv) != 5:
        sys.stderr.write("usage: summarize_open_pr_health.py <repo> <pr_number> <output_json> <output_md>\n")
        return 2
    repo = sys.argv[1]
    pr_number = sys.argv[2]
    output_json = sys.argv[3]
    output_md = sys.argv[4]

    rc, pr_out, pr_err = run(["gh", "pr", "view", pr_number, "--repo", repo, "--json", "number,title,url,headRefName,mergeable,reviewDecision"])
    pr_data = {}
    if rc == 0 and pr_out:
        pr_data = json.loads(pr_out)

    rc2, chk_out, chk_err = run(["gh", "pr", "checks", pr_number, "--repo", repo])

    data = {
        "repo": repo,
        "pr_number": int(pr_number),
        "headRefName": pr_data.get("headRefName"),
        "mergeable": pr_data.get("mergeable"),
        "reviewDecision": pr_data.get("reviewDecision"),
        "url": pr_data.get("url"),
        "checks_exit_code": rc2,
        "checks_stdout": chk_out,
        "checks_stderr": chk_err,
        "status": "blocked-no-checks" if (rc2 != 0 and "no checks reported" in (chk_out + "\n" + chk_err)) else "ok"
    }

    with open(output_json, "w") as f:
        json.dump(data, f, indent=2)

    lines = []
    lines.append("# Open PR Health")
    lines.append("")
    lines.append("- PR: #{0} ({1})".format(data["pr_number"], data.get("url") or ""))
    lines.append("- Branch: {0}".format(data.get("headRefName") or "unknown"))
    lines.append("- Mergeable: {0}".format(data.get("mergeable") or "UNKNOWN"))
    lines.append("- Review decision: {0}".format(data.get("reviewDecision") or "NONE"))
    lines.append("- Checks status: {0}".format(data["status"]))
    lines.append("")
    lines.append("## Checks Output")
    lines.append("```text")
    lines.append(data.get("checks_stdout") or data.get("checks_stderr") or "(empty)")
    lines.append("```")
    with open(output_md, "w") as f:
        f.write("\n".join(lines) + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
