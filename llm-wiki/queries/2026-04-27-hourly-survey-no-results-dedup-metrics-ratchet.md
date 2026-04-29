# Hourly survey no-results + dedup-metrics ratchet

## Context
- Run slug: `hourly-skill-candidates-20260427-020134`
- Repository: `akillness/oh-my-skills`
- Evidence artifact: `.survey/hourly-skill-candidates-20260427-020134/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260427-020134/rtk-summary.md`
- Graphify status: fallback generated (`graphify-query.err` contained `error: could not load graph: 'links'`)

## Observations
- `web backend skill` lane remained empty after recovery (`raw_count=0`, `kept_count=0`).
- Existing survey guidance needed deterministic degraded-cause handling for empty lanes (`no-results`).
- Run-level duplicate counts were zero (`raw_cross_lane_duplicate_count=0`, `kept_cross_lane_duplicate_count=0`), but reviewer reports still benefit from mandatory raw-vs-deduplicated recommendation coverage metrics.

## Ratchet applied
1. Added `no-results` to degraded-cause taxonomy and explicit rule to emit it when post-recovery `raw_count==0`.
2. Added explicit cross-lane recommendation dedup gate for final ranking while preserving raw discovery evidence.
3. Added checklist/eval updates to require raw+dedup coverage reporting and no-results assertion.

## Files changed
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/SKILL.toon`
- `.agent-skills/survey/evals/evals.json`
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`

## Provenance
- `indexed snippet` for GitHub search candidate discovery.
- `direct page retrieval` for GitHub API license fallback checks.
