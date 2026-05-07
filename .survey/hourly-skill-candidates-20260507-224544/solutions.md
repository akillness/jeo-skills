# Solution Landscape: oh-my-skills hourly maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub search lane sweep | 5-lane 질의 + recovery | 재현 가능 | 노이즈 가능 | indexed snippet |
| Metadata gate | license/freshness/signal | 추천 품질 향상 | 보수적 필터링 | direct page retrieval |

## Categories
- discovery
- gating
- merge hygiene

## What People Actually Use
- gh search repos 기반 조사
- validator 기반 산출물 체크

## Frequency Ranking
1. gh search repos
2. validate_survey_artifacts.py

## Key Gaps
- 일부 lane에서 no-results 발생

## Contradictions
- 높은 stars라도 lane intent 불일치 시 low-fit

## Key Insight
raw discovery는 유지하되 recommendation은 엄격 게이트로 분리해야 한다.
