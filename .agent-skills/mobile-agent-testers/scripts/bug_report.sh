#!/usr/bin/env bash
# Writes bug_report.md: the reported bug each agent tries to reproduce
# (briefs/reproduce.md). BUG_REPORT is an issue, as owner/repo#123 or its
# GitHub URL (read with gh: title and first post, no comments), or the report
# itself as plain text. A copy goes to results/, encrypted with the reports.
# Nothing of the report is printed: the logs of a public repo are public.
set -euo pipefail
R=${BUG_REPORT:?BUG_REPORT is empty}
URL='^https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/issues/([0-9]+)/?$'
REF='^([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)#([0-9]+)$'
if [[ "$R" =~ $URL ]] || [[ "$R" =~ $REF ]]; then
  gh api "repos/${BASH_REMATCH[1]}/issues/${BASH_REMATCH[2]}" \
    --jq '"# " + .title + "\n\nReported in " + .html_url + "\n\n" + (.body // "")' > bug_report.md
else
  printf '%s\n' "$R" > bug_report.md
fi
mkdir -p results && cp bug_report.md results/bug_report.md
echo "Bug report ready ($(wc -l < bug_report.md | tr -d ' ') lines)"
