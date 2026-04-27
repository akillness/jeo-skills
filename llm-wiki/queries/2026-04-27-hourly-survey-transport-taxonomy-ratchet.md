# 2026-04-27 hourly survey transport-taxonomy ratchet

## Query
What low-risk hardening should be merged so hourly survey runs record search transport outages explicitly instead of hiding them inside generic degraded causes?

## Inputs
- `.survey/hourly-skill-candidates-20260427-061739/evidence.json`
- `.survey/hourly-skill-candidates-20260427-061739/solutions.md`
- `.survey/hourly-skill-candidates-20260427-061739/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260427-061739/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260427-061739/graphify-query.err`
- `.survey/hourly-skill-candidates-20260427-061739/web-search-error.log`
- `.survey/hourly-skill-candidates-20260427-061739/validation.txt`

## Distilled findings
- The run hit `web_search` transport failure (`INVALID_API_KEY`) and switched to GitHub-native retrieval.
- Existing docs mention fallback behavior, but degraded-cause taxonomy in reference docs does not explicitly include `transport`.
- Without a dedicated transport cause + run artifact requirement, reviewers can misread degraded lanes as ecosystem sparsity.

## Decision
- Extend survey hourly guidance to include `transport` in degraded-cause taxonomy and require explicit transport-status/error-path recording when fallback retrieval is used.

## Why low-risk
- Documentation-only ratchet in survey skill/reference files.
- No executable runtime behavior changes.
- Rollback is a narrow revert of edited markdown files.

## Relation to prior notes
- Builds on `2026-04-26-hourly-survey-gh-field-compatibility-ratchet.md` and `2026-04-26-hourly-survey-license-fallback-ratchet.md` by hardening another degraded-transport class.

## Provenance
- direct page retrieval
- indexed snippet
