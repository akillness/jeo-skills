# Solution Landscape: hourly skill survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | lane별 추천 1순위 요약 | 자동화 가능 | lane별 편차 큼 | addyosmani/agent-skills https://github.com/addyosmani/agent-skills |
| web-frontend-skill | lane별 추천 1순위 요약 | 자동화 가능 | lane별 편차 큼 | rinafcode/teachLink_web https://github.com/rinafcode/teachLink_web |
| web-backend-skill | lane별 추천 1순위 요약 | 자동화 가능 | lane별 편차 큼 | SujalPatil21/Protfolio-Website https://github.com/SujalPatil21/Protfolio-Website |
| cli-open-source-skill | lane별 추천 1순위 요약 | 자동화 가능 | lane별 편차 큼 | nexu-io/open-design https://github.com/nexu-io/open-design |
| game-development-skill | lane별 추천 1순위 요약 | 자동화 가능 | lane별 편차 큼 | viktor-ferenczi/se-dev-skills https://github.com/viktor-ferenczi/se-dev-skills |

## Categories
- Agentic AI
- Web Frontend
- Web Backend
- CLI OSS
- Game Development

## What People Actually Use
추천 후보는 스타/최근 푸시/라이선스/아카이브 여부를 동시 만족하는 저장소 중심으로 유지한다. (provenance: indexed snippet)

## Frequency Ranking
1. agentic-ai-skill
2. web-frontend-skill
3. web-backend-skill
4. cli-open-source-skill
5. game-development-skill

## Key Gaps
- 일부 lane은 low-fit 후보 비중이 높다.
- checks 부재 시 머지 자동화가 막힌다.

## Contradictions
- 광범위 검색은 recall이 높지만 적합도 저하를 동반한다.

## Key Insight
lane-intent 토큰 중복과 negation guard를 함께 적용하면 저적합 추천을 안정적으로 차단할 수 있다. (provenance: direct page retrieval)
