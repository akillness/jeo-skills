# Recovery Query Matrix (Hourly Survey)

Purpose: provide deterministic audit visibility that every mandatory lane includes both `stage-1` and `stage-2` recovery queries, even when stage-1 already returns results.

## Command

```bash
python3 .agent-skills/survey/scripts/generate_recovery_query_matrix.py \
  .survey/<slug>/evidence.json \
  .survey/<slug>/recovery-query-matrix.md
```

## Expected Output

- Markdown table with rows per lane + stage
- Query string, raw count, and source
- Easy reviewer proof for recovery-query completeness guard

## Usage in hourly cron

Run this immediately after `build_hourly_evidence.py` and before validator/PR commentary generation.
