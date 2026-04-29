## Merge blocker: no CI checks reported
`gh pr checks` returned: `no checks reported on the 'chore/hourly-survey-20260426-135924' branch`.

Per hourly quality gate policy, this is a hard block for auto-merge.

### Required follow-up
1. Ensure required GitHub checks/workflows are configured for this branch/PR.
2. Re-run checks and confirm green status.
3. Merge after checks are present and passing.

This run intentionally **did not merge** PR #185 due to missing check signals.