#!/usr/bin/env python3
import datetime
import sys

if len(sys.argv) != 4:
    sys.stderr.write("Usage: generate_checks_blocker_comment.py <pr_number> <branch> <latest_commit>\n")
    sys.exit(2)

pr_number = sys.argv[1]
branch = sys.argv[2]
latest_commit = sys.argv[3]
now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

body = "\n".join([
    "Hourly merge blocker report",
    "",
    "- Time: {0}".format(now),
    "- PR: #{0}".format(pr_number),
    "- Branch: {0}".format(branch),
    "- Latest commit: {0}".format(latest_commit),
    "- Gate failure: no checks reported on branch",
    "",
    "Required remediation:",
    "1) Configure at least one pull_request CI check for this repository.",
    "2) Trigger checks on the PR branch.",
    "3) Confirm `gh pr checks {0}` reports green checks before merge.".format(pr_number),
    "",
    "Policy: merge remains blocked until checks are present and successful.",
])

print(body)
