#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone


def read_text(path):
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().strip()


def main(argv):
    if len(argv) != 7:
        sys.stderr.write(
            "usage: generate_open_pr_blocker_bundle.py <repo> <pr_number> <branch> <commit_sha> <checks_out> <checks_err> <output_dir>\n"
        )
        return 2

    repo, pr_number, branch, commit_sha, checks_out, checks_err, output_dir = argv
    os.makedirs(output_dir, exist_ok=True)

    out_text = read_text(checks_out)
    err_text = read_text(checks_err)
    combined = (out_text + "\n" + err_text).lower()

    no_checks = "no checks reported" in combined
    blocked_reason = "no-checks-reported" if no_checks else "manual-triage-required"
    can_merge = False

    payload = {
        "repo": repo,
        "pr_number": int(pr_number),
        "branch": branch,
        "commit_sha": commit_sha,
        "captured_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "checks_stdout": out_text,
        "checks_stderr": err_text,
        "no_checks_reported": no_checks,
        "merge_blocked_reason": blocked_reason,
        "can_merge": can_merge,
        "remediation": [
            "Enable required CI checks for pull_request events on this repository.",
            "Re-run checks by pushing a no-op commit or using GitHub Actions rerun.",
            "Re-run `gh pr checks <PR_NUMBER>` and only merge when all checks are green."
        ]
    }

    json_path = os.path.join(output_dir, "open-pr-blocker.json")
    md_path = os.path.join(output_dir, "open-pr-blocker.md")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")

    lines = [
        "# Open PR Blocker Report",
        "",
        "- Repository: {}".format(repo),
        "- PR: #{}".format(pr_number),
        "- Branch: `{}`".format(branch),
        "- Commit: `{}`".format(commit_sha),
        "- Merge Blocked Reason: `{}`".format(blocked_reason),
        "",
        "## Checks Snapshot",
        "",
        "```text",
        (out_text or "(empty stdout)"),
        "```",
        "",
        "```text",
        (err_text or "(empty stderr)"),
        "```",
        "",
        "## Required Remediation",
        "",
    ]
    for item in payload["remediation"]:
        lines.append("- " + item)

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(json_path)
    print(md_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
