# Hourly survey web-search-error-log ratchet

## Summary
- Run slug: `hourly-skill-candidates-20260427-073200`
- Transport condition: `web_search` degraded with `INVALID_API_KEY (401)`.
- Low-risk hardening candidate: standardize a deterministic transport error artifact path, `web-search-error.log`, whenever web search transport fails and fallback retrieval is used.

## Why this matters
- Existing guidance requires `transport_status` but does not enforce a single filename for search-auth failure evidence.
- A fixed artifact path improves reviewer speed and avoids run-to-run inconsistency in outage diagnostics.

## Proposed ratchet
1. In hourly repo-maintenance surveys, when `web_search` fails (especially auth failures like `INVALID_API_KEY`), write `.survey/<slug>/web-search-error.log` with the captured error.
2. Require `transport_status` fields to include:
   - `cause`
   - `fallback retrieval family`
   - `error-log path`
3. Keep lane metrics and degraded-cause reporting unchanged.

## Evidence
- Survey artifacts: `.survey/hourly-skill-candidates-20260427-073200/`
- Transport log: `.survey/hourly-skill-candidates-20260427-073200/web-search-error.log`
- RTK summary: `.survey/hourly-skill-candidates-20260427-073200/rtk-summary.md`
- Graphify refined output: `.survey/hourly-skill-candidates-20260427-073200/graphify-refined.json`
- Prior contract references:
  - `.agent-skills/survey/SKILL.md`
  - `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`

## Risk and rollback
- Risk: minimal (documentation/process-only change).
- Rollback: revert the documentation patch if it adds noise or conflicts with future artifact naming standards.
