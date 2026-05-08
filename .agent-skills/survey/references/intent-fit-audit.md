# Intent-Fit Audit Helper

Use `scripts/intent_fit_audit.py` after hourly evidence generation to surface false-positive promotion risk.

## Purpose
- Keep broad discovery evidence intact.
- Add deterministic reviewer visibility for recommendation-grade fit failures:
  - missing lane-intent token overlap
  - generic personal/demo/homework profile
  - negation-only token hits (for example: `no cli`, `without cli`, `not a cli`, `non-cli`)

## Command
```bash
python3 .agent-skills/survey/scripts/intent_fit_audit.py \
  .survey/<slug>/evidence.json \
  > .survey/<slug>/intent-fit-audit.md
```

## Output contract
The markdown output includes per-lane:
- `kept_count`
- `raw_count`
- `flagged_count`
- up to 5 flagged examples with boolean reason columns

## Provenance labels
- discovery inputs: `indexed snippet`
- metadata enrichments (if any): `direct page retrieval`
