# Hourly survey deterministic recovery trigger ratchet

- Run slug: `hourly-skill-candidates-20260425-143225`
- Date: 2026-04-25

## What changed

This run hardened the survey maintenance loop by replacing ambiguous "sparse/noisy" wording with numeric rescue triggers for unattended cron execution.

Applied changes:
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
  - Added recovery triggers: `raw_count < 8`, `kept_count == 0`, `zero_star_raw/raw_count >= 0.70`, transport degradation.
  - Added rule to preserve raw discovery evidence even when no recommendation-grade keeps survive filtering.
- `.agent-skills/survey/SKILL.md`
  - Added deterministic trigger requirement in Step 4.6.
- `.agent-skills/survey/evals/evals.json`
  - Added eval id `14` for objective trigger + recovery + provenance/lane-status reporting.

## Evidence and processing artifacts

- Survey evidence JSON: `.survey/hourly-skill-candidates-20260425-143225/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260425-143225/rtk-summary.md`
- Graphify refinement fallback: `.survey/hourly-skill-candidates-20260425-143225/graphify-refined.json`
- Graphify memory note: `graphify-out/memory/query_20260425_053705_hourly_survey_run_2026_04_25__low_risk_hardening_c.md`

## Why this matters

Deterministic rescue thresholds reduce reviewer variance and make hourly PR outcomes more repeatable under noisy keyword lanes.
