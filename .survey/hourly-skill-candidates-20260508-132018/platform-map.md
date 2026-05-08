# Platform Map
## Settings
- Cron loop with open-PR carry-forward gate enabled.
## Rules
- Merge blocked when checks are missing (`no checks reported`).
- Mandatory lane coverage and stage recovery evidence required.
## Hooks
- Reusable scripts under `.agent-skills/survey/scripts` used for deterministic scoring/reporting.
## Platform Gaps
- GitHub checks are not configured/reported for the active hourly branch, blocking merge.
- provenance: indexed snippet
