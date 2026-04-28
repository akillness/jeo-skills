# Hourly survey all-lanes-zero-results ratchet (2026-04-29)

## Summary
This run produced `raw_count == 0` across all five mandatory hourly lanes after retrieval attempts. We added a guardrail to classify this as run-level retrieval degradation instead of an ecosystem-quality conclusion.

## Why this ratchet
- Lane-level `no-results` alone can hide run-wide transport/query collapse.
- A deterministic run-level marker improves triage and prevents misleading summaries.

## Change
- `.agent-skills/survey/SKILL.md`: add rule to set `transport_status.sweep_health = "degraded-all-lanes-zero-results"` when all five lanes end with `raw_count == 0`.
- `.agent-skills/survey/SKILL.toon`: mirror the same run-level rule.

## Evidence
- `.survey/hourly-skill-candidates-20260429-000110/evidence.json`
- `.survey/hourly-skill-candidates-20260429-000110/validation.txt`
- `.survey/hourly-skill-candidates-20260429-000110/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260429-000110/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260429-000110/obsidian-status.txt`

## Risk / rollback
- Risk: Low (documentation/rules guidance only).
- Rollback: revert this commit to restore previous wording.
