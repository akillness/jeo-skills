# Hourly Lane Health Report Helper

Use this helper to produce a deterministic reviewer-facing lane summary from `.survey/<slug>/evidence.json`.

## Command

```bash
python3 .agent-skills/survey/scripts/build_lane_health_report.py .survey/<slug>
```

## Why this exists
- Reduces hand-written summary drift versus evidence metrics.
- Makes `raw_count`, `kept_count`, and degraded causes visible in one table.
- Supports no-checks-reported blocker runs where merge is deferred but artifacts must still be auditable.

## Output contract
- Markdown table with one row per lane.
- Includes `recommended_lane_count` and `single_lane_concentration`.
- Safe to embed directly into PR body or self-review comment.

Provenance label: direct page retrieval
