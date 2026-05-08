# Hourly Recommendation Quality Audit

Use `scripts/audit_hourly_recommendation_quality.py` to enforce recommendation-grade policy after evidence generation.

## Why

Hourly runs can accumulate noisy recommendations even when raw discovery is broad and useful. This audit gives a deterministic gate for recommendation-quality keeps.

## Command

```bash
python3 .agent-skills/survey/scripts/audit_hourly_recommendation_quality.py .survey/<slug>/evidence.json
```

## What it checks

- lane-intent token overlap on recommended candidates
- negation-aware intent guard (`no cli`, `without cli`, `not a cli`, `non-cli`)
- generic personal/demo exclusion guard (`portfolio`, `homework`, `assignment`, `demo`)
- freshness floor (`pushed_at`/`updated_at` not older than 24 months)

## Output

- CSV-style rows for each recommended candidate
- non-zero exit with `QUALITY_VIOLATIONS` when policy is violated

## Integration point

Run this check after:
1. hourly evidence assembly
2. `validate_hourly_evidence_contract.py`

and before PR packaging.

If violations occur, keep raw evidence but either:
- demote violating candidates from recommendation-grade list, or
- document explicit exception rationale and risk in artifacts.
