# Solution Landscape: hourly skill candidate survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| rhysmcneill/agentic-ai-library | lane intent + recent activity | stars 3 | metadata strict gate로 일부 lane 과소추천 가능 | https://github.com/rhysmcneill/agentic-ai-library |

## Categories
- discovery: broad keyword sweep
- rescue: stage-1/stage-2 recovery query
- promotion: token overlap + negation-aware + signal floor

## What People Actually Use
현재 런은 GitHub 검색 기반 인덱스 증거를 우선 사용했고, 각 lane별 raw_count/kept_count/median stars를 기준으로 추천을 추렸다. (provenance: indexed snippet)

## Frequency Ranking
1. cli open source skill 관련 저장소가 가장 많이 탐지됨
2. web/backend는 탐지되지만 promotion gate에서 일부 탈락
3. game development lane은 후보 수가 상대적으로 적음

## Key Gaps
- 일부 lane에서 `kept_count == 0` 또는 low-fit 비중 높음
- checks 부재 PR 누적 시 merge cadence 저하

## Contradictions
- stars가 높아도 lane-intent 토큰 부재면 추천에서 제외되어 recall/precision 충돌

## Key Insight
추천 품질 일관성을 위해서는 broad sweep 증거 보존 + promotion gate 엄격 적용 + degraded taxonomy 명시가 동시에 필요하다.
