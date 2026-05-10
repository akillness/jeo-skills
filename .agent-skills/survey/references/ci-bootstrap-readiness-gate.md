# CI Bootstrap Readiness Gate (No-checks blocker)

## Purpose
When hourly runs hit `no checks reported`, this gate provides a deterministic pre-merge diagnostic artifact so maintainers can bootstrap CI quickly.

## Script
- `scripts/check_ci_bootstrap_readiness.py <repo> <output_json>`

## Output Contract
Produces JSON with:
- `status`: `pass|degraded`
- `merge_blocked_reason`: `none|no-checks-reported|workflow-discovery-failed`
- `checks[]`: machine-readable checks (`workflow_files_present`, `active_workflow_present`, `recent_workflow_runs_present`)
- `remediation[]`: ordered bootstrap actions

## Recommended Hourly Usage
1. Run after survey artifact generation and before merge decision.
2. Persist output under active run slug:
   - `.survey/<slug>/ci-bootstrap-readiness.json`
3. If `status=degraded`, post blocker comment and do not merge.

## Provenance Labels
Use validator-accepted labels in markdown around findings:
- `direct page retrieval`
- `feed recovery`
- `indexed snippet`
- `thin evidence`

## Notes
This gate is intentionally lightweight and repo-local. It does not require repository admin APIs and is safe for unattended cron runs.
