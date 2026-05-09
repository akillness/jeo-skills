#!/usr/bin/env python3
import json
import os
import subprocess
import sys


def run(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return p.returncode, p.stdout, p.stderr


def main():
    if len(sys.argv) != 5:
        sys.stderr.write("usage: summarize_open_pr_health.py <repo> <pr_number> <slug_dir> <output_md>\n")
        return 2
    repo = sys.argv[1]
    pr_number = sys.argv[2]
    slug_dir = sys.argv[3]
    output_md = sys.argv[4]

    rc, pr_out, pr_err = run(["gh", "pr", "view", pr_number, "-R", repo, "--json", "number,title,url,headRefName,mergeStateStatus,isDraft"])
    if rc != 0:
        sys.stderr.write(pr_err)
        return rc
    pr = json.loads(pr_out)

    rc2, chk_out, chk_err = run(["gh", "pr", "checks", pr_number, "-R", repo])
    checks_state = "ok" if rc2 == 0 else "blocked"

    lines = []
    lines.append("# Open PR Health Summary")
    lines.append("")
    lines.append("- repo: {}".format(repo))
    lines.append("- pr_number: {}".format(pr.get("number")))
    lines.append("- title: {}".format(pr.get("title")))
    lines.append("- url: {}".format(pr.get("url")))
    lines.append("- branch: {}".format(pr.get("headRefName")))
    lines.append("- merge_state: {}".format(pr.get("mergeStateStatus")))
    lines.append("- checks_state: {}".format(checks_state))
    lines.append("")
    lines.append("## Checks output")
    lines.append("")
    if chk_out.strip():
        lines.append("```text")
        lines.append(chk_out.strip())
        lines.append("```")
    if chk_err.strip():
        lines.append("```text")
        lines.append(chk_err.strip())
        lines.append("```")

    os.makedirs(slug_dir, exist_ok=True)
    with open(output_md, "w") as f:
        f.write("\n".join(lines) + "\n")

    payload = {
        "repo": repo,
        "pr": pr,
        "checks_exit_code": rc2,
        "checks_stdout": chk_out,
        "checks_stderr": chk_err,
        "checks_state": checks_state,
    }
    with open(os.path.join(slug_dir, "open-pr-health.json"), "w") as f:
        json.dump(payload, f, indent=2)

    return 0


if __name__ == "__main__":
    sys.exit(main())
