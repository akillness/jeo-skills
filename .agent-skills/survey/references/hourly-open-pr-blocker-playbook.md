# Hourly Open-PR Blocker Playbook

Purpose: provide a deterministic carry-forward workflow when hourly automation finds at least one open PR and the current branch reports `no checks reported`.

## Trigger Conditions
- `gh pr list --state open` returns one or more PRs.
- Current carry-forward PR branch check status returns `no checks reported`.

## Required Actions (in order)
1. Capture open-PR state into run artifacts (`open-prs.json`).
2. Capture `gh pr checks` stdout/stderr into temporary files.
3. Normalize checks artifacts into slug-scoped files via `collect_open_pr_checks_artifacts.py`.
4. Generate blocker bundle via:
   - `generate_open_pr_blocker_bundle.py <repo> <pr> <branch> <sha> <checks_out> <checks_err> <output_dir>`
5. Post blocker comment using `gh pr comment --body-file`.
6. Generate `ci-bootstrap-readiness.json` and include remediation list in final run report.
7. Keep merge blocked until checks are present and green.

## Deterministic Remediation Text
- Configure required CI workflows for pull requests.
- Ensure branch protection requires at least one status check.
- Re-run checks after CI bootstrap and verify green state before merge.

## Artifact Contract
Minimum files for auditability:
- `open-prs.json`
- `open-pr-checks.out`
- `open-pr-checks.err`
- `open-pr-checks-summary.json`
- `open-pr-blocker.md`
- `open-pr-blocker.json`
- `ci-bootstrap-readiness.json`

## Common Pitfalls
- Posting blocker comments with stale commit SHA.
- Leaving temp check capture files untracked at repository root.
- Creating new PRs while open PR gate is active.
