CI blocker update for hourly carry-forward run.

- PR: #271
- Branch: chore/hourly-survey-20260507-224544
- Commit: 0486ce3c15532b6a855231ea1fc2dff0135d8cd0
- Blocker: no checks reported on this branch.

Required remediation:
1. Configure at least one pull_request CI workflow in this repository.
2. Add required status checks in branch protection.
3. Re-run checks and confirm green before merge.

This run added new survey artifacts and a reusable evidence-contract validator script, but merge remains blocked until checks exist and pass.
