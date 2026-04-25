# Hourly survey lane-metrics ratchet (2026-04-25)

## Context
The hourly five-lane survey loop already tracked `lane_status` (`pass|degraded`) and `degraded_causes`, but reviewer confidence still depended on subjective interpretation.

## New ratchet
Add compact quantitative lane-health metrics alongside `lane_status` in markdown artifacts:
- `kept_count`
- `raw_count`
- `median_stars_raw`
- `zero_star_raw`

This keeps the report token-light while making quality drift visible across hourly runs.

## Why this is low risk
- No destructive behavior; documentation/skill-contract hardening only.
- Existing relevance gate and metadata checks remain unchanged.
- Rollback is a single-commit revert.

## Evidence
- `.survey/hourly-skill-candidates-20260425-110414/evidence.json` (direct page retrieval)
- `.survey/hourly-skill-candidates-20260425-110414/solutions.md` (lane_status and lane metrics)
- `graphify-out/memory/query_20260425_020657_hourly_survey_run_2026_04_25__what_low_risk_survey.md`
