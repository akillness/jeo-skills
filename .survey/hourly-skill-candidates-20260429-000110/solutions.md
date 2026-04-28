## Solution List
- agentic_ai_skill: raw=0, kept=0, lane_status=degraded (indexed snippet, direct page retrieval)
- web_frontend_skill: raw=0, kept=0, lane_status=degraded (indexed snippet, direct page retrieval)
- web_backend_skill: raw=0, kept=0, lane_status=degraded (indexed snippet, direct page retrieval)
- cli_open_source_skill: raw=0, kept=0, lane_status=degraded (indexed snippet, direct page retrieval)
- game_development_skill: raw=0, kept=0, lane_status=degraded (indexed snippet, direct page retrieval)

## Categories
- candidate discovery
- relevance gating
- quality hardening

## What People Actually Use
- GitHub search listings for candidate discovery (indexed snippet).
- Repo detail API for license/freshness checks (direct page retrieval).

## Frequency Ranking
- agentic_ai_skill: kept_count=0
- web_frontend_skill: kept_count=0
- web_backend_skill: kept_count=0
- cli_open_source_skill: kept_count=0
- game_development_skill: kept_count=0

## Key Gaps
- agentic_ai_skill: degraded_causes=no-results
- web_frontend_skill: degraded_causes=no-results
- web_backend_skill: degraded_causes=no-results
- cli_open_source_skill: degraded_causes=no-results
- game_development_skill: degraded_causes=no-results

## Contradictions
- Fresh repos can still fail due to missing license; older repos may have stronger stars but fail freshness gate.

## Key Insight
- Deterministic lane-level metric integrity checks reduce false-positive health in unattended runs.
