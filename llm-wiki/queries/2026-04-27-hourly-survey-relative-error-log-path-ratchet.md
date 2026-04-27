# Hourly survey relative-error-log-path ratchet

## Question
What low-risk hardening should be merged after this hourly five-lane survey run to improve transport-fallback portability without weakening evidence quality?

## Evidence consulted
- `.survey/hourly-skill-candidates-20260427-172031/evidence.json`
- `.survey/hourly-skill-candidates-20260427-172031/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260427-172031/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260427-172031/web-search-error.log`
- Prior run signal: `.survey/hourly-skill-candidates-20260427-073200/evidence.json`

## Findings
- Current run required transport fallback (`web_search` INVALID_API_KEY) and recorded deterministic `.survey/<slug>/web-search-error.log` evidence.
- Historical run `hourly-skill-candidates-20260427-073200` stored `transport_status.web_search.error_log` as an absolute host path (`/Users/...`), which lowers portability for cross-environment replay and diff review.
- Existing survey guidance standardizes filename/path shape but does not explicitly state that absolute host paths are disallowed for new artifacts.

## Recommendation
Codify a strict path-form rule in survey guidance: `transport_status.web_search.error_log` must be repository-relative `.survey/<slug>/web-search-error.log`; absolute machine-specific prefixes must not be emitted for new hourly artifacts.

## Rationale
- Keeps fallback evidence deterministic and copy-pastable across machines/runners.
- Improves PR-review diff quality by removing host-prefix noise.
- Low-risk: documentation/contract hardening only; no runtime logic changes required.

## Risk and rollback
- Risk: historical artifacts may still contain absolute paths; reviewers should treat this as legacy.
- Rollback: revert the added rule lines in `.agent-skills/survey/SKILL.md` and `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`.
