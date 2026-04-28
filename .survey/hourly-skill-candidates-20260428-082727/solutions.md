## Solution List
1. Add an explicit eval scenario validating repository-relative transport error-log paths in degraded `web_search` runs.
2. Keep fallback behavior documented in evidence (`INVALID_API_KEY` + GitHub API fallback).

## Categories
- Survey quality ratchet
- Portability hardening

## What People Actually Use
- GitHub REST search fallback (`gh api search/repositories`) when web search transport is unavailable. (indexed snippet)
- Repository-relative artifact references for reproducible automation. (direct page retrieval)

## Frequency Ranking
1. Transport fallback logging (high)
2. Portability/path hygiene checks (high)
3. Skill-candidate discovery quality checks (medium)

## Key Gaps
- Existing eval suite did not explicitly assert relative `transport_status.web_search.error_log` path behavior.

## Contradictions
- None critical; only a test coverage gap between policy text and eval enforcement.

## Key Insight
A minimal eval-only ratchet catches portability regressions early without altering runtime logic.

Provenance: indexed snippet, direct page retrieval
