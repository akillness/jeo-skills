# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | gh search + relevance gate | lane_status=pass | causes=none | top=iwe-org/skills |
| web-frontend-skill | gh search + relevance gate | lane_status=degraded | causes=low-signal,low-fit | top=none |
| web-backend-skill | gh search + relevance gate | lane_status=pass | causes=none | top=Gaku52/software-engineering-universe |
| cli-open-source-skill | gh search + relevance gate | lane_status=pass | causes=none | top=nexu-io/open-design |
| game-development-skill | gh search + relevance gate | lane_status=pass | causes=none | top=tjboudreaux/cc-plugin-unity-gamedev |

## Categories
- Evidence collection
- Recommendation gating
- Merge safety gates

## What People Actually Use
- GitHub-native search and metadata checks are used as primary retrieval in cron-safe mode (indexed snippet + direct page retrieval).

## Frequency Ranking
1. cli-open-source-skill
2. web-backend-skill
3. agentic-ai-skill
4. web-frontend-skill
5. game-development-skill

## Key Gaps
- Some lanes can remain degraded due to low-signal/no-results conditions.

## Contradictions
- Broad keyword recall surfaces many low-fit repos; recommendation-grade keeps must stay strict.

## Key Insight
Deterministic recovery query logging (stage-1 and stage-2 for every lane) plus lane integrity checks improves reviewer auditability in unattended runs.
