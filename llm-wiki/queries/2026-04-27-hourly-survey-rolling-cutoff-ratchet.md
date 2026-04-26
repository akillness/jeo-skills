# 2026-04-27 hourly survey rolling-cutoff ratchet

## Query
What low-risk hardening should be merged after this hourly survey run to keep freshness filtering aligned with policy over time?

## Inputs
- `.survey/hourly-skill-candidates-20260426-165011/evidence.json`
- `.survey/hourly-skill-candidates-20260426-165011/solutions.md`
- `.survey/hourly-skill-candidates-20260426-165011/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260426-165011/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260426-165011/validation.txt`

## Distilled findings
- Survey references define a freshness rule of rolling 24 months.
- Several lane recovery query templates still hardcode `pushed:>=2024-01-01`.
- Static dates drift and slowly weaken recommendation quality without obvious failures.

## Decision
- Update `keyword-sweep-and-relevance-rescue.md` so recovery templates use a rolling cutoff variable (computed once per run), not a fixed date literal.

## Why low-risk
- Documentation/reference-only update.
- Preserves existing lane logic and validator contract.
- Easy rollback by reverting one markdown file.

## Provenance
- direct page retrieval
- indexed snippet
