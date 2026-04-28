# Hourly survey transport-envelope ratchet (2026-04-28)

## Context
- Hourly run experienced `web_search` transport failure with provider payload tag `INVALID_API_KEY`.
- Error payload included request-scoped IDs (`requestId`) that were not previously required in survey artifacts.
- Carry-forward target PR #208 was `DIRTY`, so replacement branch from `main` was required.

## Change
- Updated `.agent-skills/survey/SKILL.md` to require recording provider envelope fields when available:
  - `transport_status.web_search.error_tag`
  - `transport_status.web_search.request_ids[]`
- Updated `.agent-skills/survey/evals/evals.json` assertions to check envelope capture.

## Evidence
- `.survey/hourly-skill-candidates-20260428-093148/evidence.json`
- `.survey/hourly-skill-candidates-20260428-093148/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260428-093148/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260428-093148/web-search-error.log`

## Why it matters
- Improves cross-run outage correlation and root-cause triage while keeping artifacts portable and low-cost.
