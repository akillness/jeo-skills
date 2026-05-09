# Open PR Blocker Bundle

This reference defines a reusable, deterministic blocker bundle for hourly runs when an existing PR is open and merge gates are not satisfied.

## Why

When `gh pr checks` returns `no checks reported`, unattended hourly runs must avoid merge and still leave auditable evidence.

## Script

`python3 .agent-skills/survey/scripts/generate_open_pr_blocker_bundle.py <repo> <pr_number> <branch> <commit_sha> <checks_out> <checks_err> <output_dir>`

### Inputs
- `repo`: owner/repo (for example `akillness/oh-my-skills`)
- `pr_number`: numeric PR id
- `branch`: PR head branch
- `commit_sha`: latest commit SHA on PR head
- `checks_out`: captured stdout from `gh pr checks`
- `checks_err`: captured stderr from `gh pr checks`
- `output_dir`: run-local directory under `.survey/<slug>/`

### Outputs
- `open-pr-blocker.json`: machine-readable blocker status
- `open-pr-blocker.md`: human-readable blocker report

## Merge policy
- If `no checks reported` appears in checks stdout/stderr, set `merge_blocked_reason: no-checks-reported`.
- Do not merge until checks are present and green.
- Post blocker markdown to the PR with `gh pr comment --body-file`.
