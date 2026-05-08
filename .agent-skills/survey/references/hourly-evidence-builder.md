# Hourly Evidence Builder

Use `scripts/build_hourly_evidence.py` to generate `evidence.json` and `candidates.json` for hourly runs with deterministic lane gates.

## Purpose
- Enforce five-lane contract keys and recovery query traceability.
- Apply recommendation-grade guards: lane token overlap, negation checks, generic personal-repo exclusion, signal floor, freshness <= 24 months, and license normalization/enrichment.
- Prevent impossible lane metrics (`kept_count > raw_count`) and compute concentration flags.

## Usage

```bash
export SLUG=hourly-skill-candidates-<timestamp>
python3 .agent-skills/survey/scripts/build_hourly_evidence.py
python3 .agent-skills/survey/scripts/validate_hourly_evidence_contract.py .survey/$SLUG/evidence.json
```

## Inputs
- `.survey/<slug>/lane-queries.json` from `generate_hourly_lane_queries.py`

## Outputs
- `.survey/<slug>/evidence.json`
- `.survey/<slug>/candidates.json`

## Provenance
Discovery data is marked `indexed snippet`; PR/check state uses `direct page retrieval`.
