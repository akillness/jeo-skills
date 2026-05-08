# Freshness Window Audit Utility

Use this helper to quantify recency drift from hourly evidence artifacts.

## Why
- The hourly gate requires recommendation-grade candidates to be fresh (<=24 months).
- This utility gives a compact stale/missing-timestamp count by lane for reviewer auditability.

## Command

```bash
python3 .agent-skills/survey/scripts/audit_freshness_window.py .survey/<slug>/evidence.json --months 24
```

## Output
- JSON with `lanes` and `totals` sections.
- Per lane: `raw_examples`, `stale_over_threshold`, `missing_timestamp`.

## Provenance labels
Reference lane evidence labels in markdown summaries:
- indexed snippet
- direct page retrieval

## Operational note
Run this after `build_hourly_evidence.py` and before PR packaging so stale drift is visible in the same run artifacts.
