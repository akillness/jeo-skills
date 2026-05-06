# Solution Landscape: hourly-skill-candidates

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| rhysmcneill/agentic-ai-library | lane-token overlap + metadata gate | 신호/라이선스/신선도 명시 | lane 편향 가능성 | https://github.com/rhysmcneill/agentic-ai-library (direct page retrieval) |

## Categories
- agentic ai skill
- web frontend skill
- web backend skill
- cli open source skill
- game development skill

## What People Actually Use
- GitHub에서 최근 업데이트 + stars 신호가 있는 저장소를 우선 채택.
- direct page retrieval 기반 링크를 모든 추천 항목에 남김.

## Frequency Ranking
1. web frontend skill lane 후보
2. web backend skill lane 후보
3. agentic ai skill lane 후보
4. game development skill lane 후보
5. cli open source skill lane 후보

## Key Gaps
- 일부 lane은 low-fit/no-results 가능성이 있어 recovery query 기록이 필수.
- 체크 미보고 PR이 누적되면 merge cadence가 저하됨.

## Contradictions
- 고별점(stars) 후보가 lane 의도와 불일치할 수 있어 token-overlap gate가 필요.

## Key Insight
- 추천 품질은 "신호 + 의도 적합성 + 라이선스/신선도" 3중 게이트를 동시에 만족할 때 안정적이다. (provenance: direct page retrieval)
