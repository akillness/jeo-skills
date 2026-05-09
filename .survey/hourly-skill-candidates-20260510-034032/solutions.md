# Solution Landscape: oh-my-skills hourly survey loop

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | lane-query | kept=6 raw=30 | degraded_causes=none | provenance=indexed snippet |
| web-frontend-skill | lane-query | kept=1 raw=5 | degraded_causes=none | provenance=indexed snippet |
| web-backend-skill | lane-query | kept=1 raw=6 | degraded_causes=none | provenance=indexed snippet |
| cli-open-source-skill | lane-query | kept=2 raw=5 | degraded_causes=none | provenance=indexed snippet |
| game-development-skill | lane-query | kept=3 raw=30 | degraded_causes=none | provenance=indexed snippet |

## Categories
- Discovery lanes
- Quality gates
- Merge blockers

## What People Actually Use
- gh search repos for candidate recall, then lane-level filtering in evidence.json.

## Frequency Ranking
1. agentic-ai-skill
2. web-frontend-skill
3. web-backend-skill
4. cli-open-source-skill
5. game-development-skill

## Key Gaps
- No CI checks reported on active PR branch.

## Contradictions
- High recall can reduce precision without low-fit filters.

## Key Insight
- Deterministic recovery stage logging improves reviewer auditability.

Provenance: indexed snippet.
