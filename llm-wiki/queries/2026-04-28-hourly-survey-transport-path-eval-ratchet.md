# 2026-04-28 Hourly survey transport-path eval ratchet

## Context
- web_search transport failed with `INVALID_API_KEY` (401), requiring GitHub REST fallback in this run.
- Existing survey policy already required repository-relative `transport_status.web_search.error_log` paths.

## Ratchet
- Added `evals.json` case `id: 24` to assert repository-relative transport error-log path behavior in degraded web_search runs.

## Why this matters
- Prevents host-absolute error-log paths (`/Users/...`, `/home/...`) from leaking into artifacts.
- Keeps hourly survey evidence portable across runners and reviewers.

## Artifacts
- `.survey/hourly-skill-candidates-20260428-082727/evidence.json`
- `.survey/hourly-skill-candidates-20260428-082727/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260428-082727/graphify-refined.json`
