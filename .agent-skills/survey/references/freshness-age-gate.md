# Freshness Age Gate (24 months)

This reference defines how hourly survey runs should assess candidate freshness.

## Rule
- Recommendation-grade candidates must be active within the last 24 months using `pushedAt` (fallback: `updatedAt`).
- Presence of a timestamp alone is not enough; age-based comparison is required.

## Audit Artifact
- Script: `.agent-skills/survey/scripts/audit_freshness_window.py`
- Output: `.survey/<slug>/freshness-audit.json`

## Output Contract
Per lane output includes:
- `raw_examples`
- `stale_over_threshold`
- `missing_timestamp`
- `stale_ratio`
- `lane_status` (`pass|degraded`)
- `degraded_causes` (`stale`, `missing-timestamp`)

Top-level output includes:
- `status` (`pass|degraded`)
- `degraded_causes`
- totals including `degraded_lanes`

## Use in PR review
If `status=degraded`, keep merge blocked unless degraded causes are acknowledged in blocker report and remediation is tracked.
