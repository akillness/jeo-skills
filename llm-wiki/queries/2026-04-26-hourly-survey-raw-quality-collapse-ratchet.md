# 2026-04-26 hourly survey raw-quality collapse ratchet

## Query
What low-risk hardening should be merged so hourly survey lanes cannot appear healthy when discovery quality collapses?

## Inputs
- `.survey/hourly-skill-candidates-20260426-201533/evidence.json`
- `.survey/hourly-skill-candidates-20260426-201533/solutions.md`
- `.survey/hourly-skill-candidates-20260426-201533/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260426-201533/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260426-201533/validation.txt`

## Distilled findings
- Keyword lanes still return enough raw hits, but quality can collapse when low-signal repos dominate.
- This run observed aggregate `zero_star_raw` saturation (0.57), high enough to mask recommendation weakness behind count-based health.
- Existing lane metrics expose the signal, but no explicit recovery trigger was codified for cross-lane raw-quality collapse.

## Decision
- Add a deterministic raw-quality collapse trigger (`zero_star_raw/raw_count >= 0.50`) to `keyword-sweep-and-relevance-rescue.md`, with one cross-lane recovery query and required degraded-cause logging.

## Why low-risk
- Reference-doc change only (`.agent-skills/survey/references/...`), no runtime code path edits.
- Existing validator contract and lane status schema remain unchanged.
- Rollback is a single-file revert.

## Provenance
- indexed snippet
- direct page retrieval
