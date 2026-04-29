# Hourly survey lane-health diagnostics (2026-04-26)

## Question
How should hourly survey markdown distinguish degraded lanes so reviewers can triage quickly without re-parsing raw JSON?

## Run context
- slug: `hourly-skill-candidates-20260426-070240`
- lanes: agentic(pass), frontend(degraded), backend(degraded), cli(pass), game(pass)
- notable pattern: backend had `raw_count=0` after recovery while frontend had noisy raw hits with `kept_count=0`

## Synthesis
1. Keep `lane_status: pass|degraded` as the top-level stable field.
2. Add canonical interpretation labels in markdown:
   - `degraded-no-results`: `raw_count == 0` and `degraded_causes` must include `no-results`
   - `degraded-noisy`: `raw_count > 0` and recommendation keeps remain `kept_count == 0`
3. Expand degraded-cause taxonomy to include `no-results` so empty-lane failure modes are not conflated with noisy lanes.
4. Preserve lane metrics (`kept_count`, `raw_count`, `median_stars_raw`, `zero_star_raw`) and provenance labels in reviewer-facing artifacts.

## Applied change
- Updated `.agent-skills/survey/SKILL.md`, `SKILL.toon`, and `evals/evals.json` to codify degraded lane subtype interpretation and `no-results` taxonomy coverage.
- Updated survey reference guide: `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`.

## Provenance
- direct page retrieval (GitHub search API)
- indexed snippet
- thin evidence
