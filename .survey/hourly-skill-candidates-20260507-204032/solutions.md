# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic ai skill | gh search repos + gate filtering | 빠른 수집 | 키워드 노이즈 | raw=30, kept=13 |
| web frontend skill | gh search repos + gate filtering | 빠른 수집 | 키워드 노이즈 | raw=30, kept=2 |
| web backend skill | gh search repos + gate filtering | 빠른 수집 | 키워드 노이즈 | raw=30, kept=2 |
| cli open source skill | gh search repos + gate filtering | 빠른 수집 | 키워드 노이즈 | raw=30, kept=8 |
| game development skill | gh search repos + gate filtering | 빠른 수집 | 키워드 노이즈 | raw=30, kept=2 |

## Categories
- Discovery: GitHub code/repo search
- Filtering: signal + freshness + intent overlap + negation guard

## What People Actually Use
- GitHub 검색 API 중심 운영 (indexed snippet).

## Frequency Ranking
1. agentic ai skill
2. web frontend skill
3. web backend skill
4. cli open source skill
5. game development skill

## Key Gaps
- degraded lane: none

## Contradictions
- 키워드 일치여도 개인 데모/과제 저장소는 추천 제외 필요.

## Key Insight
- 추천 품질은 검색량보다 lane-fit/신선도/신호 floor 결합이 더 크게 좌우됨. provenance: thin evidence