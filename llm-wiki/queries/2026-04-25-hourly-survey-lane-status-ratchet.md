# Hourly survey lane-status ratchet (2026-04-25)

## Question
How can hourly survey runs become easier to review when some keyword lanes are sparse/noisy after relevance gating?

## Prior knowledge consulted
- `queries/2026-04-25-hourly-survey-noise-gate.md`
- `queries/2026-04-25-hourly-survey-freshness-floor.md`
- `queries/2026-04-25-hourly-survey-recovery-template.md`

## New finding
Even with noise/freshness/recovery guidance, reviewers still infer lane health implicitly. A small doc ratchet helps: require explicit lane status vocabulary (`pass|degraded`) plus degraded-cause taxonomy (`license`, `stale`, `low-fit`, `archived`) in markdown summaries.

## Evidence anchors
- `.survey/hourly-skill-candidates-20260424-223708/evidence.json`
- `.survey/hourly-skill-candidates-20260424-223708/solutions.md`
- `.survey/hourly-skill-candidates-20260424-223708/graphify-refined.json`

## Operational impact
- Low-risk docs/eval update only
- Faster PR review decisions for under-threshold lanes
- Keeps provenance visible without changing validator contract
