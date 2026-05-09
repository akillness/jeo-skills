# Recovery Stage Coverage Audit

## Purpose
Ensure every mandatory lane records both recovery stages (`stage-1`, `stage-2`) in `recovery_queries`, even when stage-1 already returns results.

This guard prevents non-deterministic artifacts and supports reviewer auditability for degraded (`raw_count == 0`) lanes.

## Command

```bash
python3 .agent-skills/survey/scripts/collect_lane_recovery_coverage.py \
  .survey/<slug>/evidence.json \
  .survey/<slug>/recovery-stage-coverage.json
```

## Expected Output
- `ok: true` when every lane has both stage entries.
- `lane_stage_coverage` map per lane with query counts.
- non-zero exit when any lane is missing stage coverage.

## Integration Point
Run this after `build_hourly_evidence.py` and before final validation/PR packaging.

## Provenance Labels
Use validator-accepted labels in markdown where applicable:
- direct page retrieval
- feed recovery
- browser-rendered retrieval
- indexed snippet
- browser-rendered indexed snippet
- thin evidence
