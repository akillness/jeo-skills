# Solution Landscape: hourly skill candidate survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | gh search repos + lane gates | deterministic degraded reporting | can be conservative and filter aggressively | kept=5, raw=30 |
| web-frontend-skill | gh search repos + lane gates | deterministic degraded reporting | can be conservative and filter aggressively | kept=0, raw=5 |
| web-backend-skill | gh search repos + lane gates | deterministic degraded reporting | can be conservative and filter aggressively | kept=0, raw=1 |
| cli-open-source-skill | gh search repos + lane gates | deterministic degraded reporting | can be conservative and filter aggressively | kept=1, raw=1 |
| game-development-skill | gh search repos + lane gates | deterministic degraded reporting | can be conservative and filter aggressively | kept=1, raw=30 |

## Categories
- Discovery
- Filtering
- Quality gates

## What People Actually Use
GitHub code search and repository metadata are used as primary indexed snippet source in unattended runs.

## Frequency Ranking
1. gh search repos across mandatory lanes
2. metadata gating for stale/archive/license
3. blocker comment for no-checks state

## Key Gaps
- CI checks absent on long-lived hourly branches.
- Some lanes have low-fit noise even after token overlap filtering.

## Contradictions
- Broad recall needs loose search, but recommendation quality needs strict fit/signal gating.

## Key Insight
Keep broad evidence in JSON, but only promote recommendation-grade candidates with explicit rationale and risk notes. (direct page retrieval)
