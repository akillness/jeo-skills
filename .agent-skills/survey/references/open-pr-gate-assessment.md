# Open PR Gate Assessment (hourly cron helper)

Use this helper before any new branch/PR creation in unattended hourly loops.

## Why
- Enforces open-PR hard gate deterministically.
- Detects `no checks reported` early and switches run mode to checks-degraded.
- Produces machine-readable triage output for blocker comments and run reports.

## Command

```bash
python3 .agent-skills/survey/scripts/assess_open_pr_gate.py akillness/oh-my-skills > .survey/<slug>/open-pr-gate.json
```

## Output contract
- `open_pr_count`
- `checks_degraded`
- `merge_candidates[]`
- `blocked_prs[]` with `checks_no_reported` and `checks_excerpt`

## Suggested actions
1. `open_pr_count >= 1`: do not open a new PR.
2. `checks_degraded == true`: post blocker comment and continue cadence on existing PR branch.
3. Only open new PR after `open_pr_count == 0`.
