# 2026-04-25 hourly survey signal-floor codification

## Query
What low-risk hardening should we land after this hourly five-lane survey run to improve recommendation-grade candidate quality without losing discovery coverage?

## Inputs
- `.survey/hourly-skill-candidates-20260425-154513/evidence.json`
- `.survey/hourly-skill-candidates-20260425-154513/rtk-summary.md`
- Previous hourly survey hardening notes under `llm-wiki/queries/2026-04-25-*`

## Distilled findings
- Raw discovery coverage is healthy in multiple lanes, but recommendation keeps in some lanes remain vulnerable to low-traction noise.
- Freshness/license gates alone are not enough when many repos are recent but near-zero traction.
- Deterministic signal-floor guidance can improve merge-ready keep quality while preserving broad lane evidence.

## Decision
- Codify a recommendation-grade signal floor in survey docs (`stars >= 3` default or explicit exception rationale).
- Extend degraded-cause reporting taxonomy to include `low-signal`.
- Add eval coverage to prevent regression.

## Why low-risk
- No destructive behavior: raw evidence remains preserved.
- Existing process semantics stay intact (lane_status, rescue triggers, provenance contract).
- Change is guidance + evaluation hardening, with explicit exception path for sparse lanes.
