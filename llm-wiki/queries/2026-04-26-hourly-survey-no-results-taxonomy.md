# Hourly survey no-results taxonomy ratchet

## Run context
- Run slug: `hourly-skill-candidates-20260426-221631`
- Branch: `chore/hourly-survey-20260426-221631`
- Evidence: `.survey/hourly-skill-candidates-20260426-221631/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260426-221631/rtk-summary.md`
- Graphify artifact: `.survey/hourly-skill-candidates-20260426-221631/graphify-refined.json`

## What changed
- Added a survey hardening rule: if a lane remains `raw_count == 0` after recovery, require explicit `degraded_causes` reporting with `no-results`.
- This removes ambiguous degraded lanes where `degraded_causes` was empty and improves deterministic reviewer triage.

## Why this ratchet
- Prior lane-metrics and lane-status ratchets improved comparability, but zero-hit lanes could still be under-specified.
- This run reproduced a zero-hit backend lane and confirmed that explicit `no-results` tagging improves quality-gate clarity.

## References
- `llm-wiki/queries/2026-04-25-hourly-survey-lane-status-ratchet.md`
- `llm-wiki/queries/2026-04-25-hourly-survey-lane-metrics-ratchet.md`
- `llm-wiki/queries/2026-04-26-hourly-survey-gh-field-compatibility-ratchet.md`
