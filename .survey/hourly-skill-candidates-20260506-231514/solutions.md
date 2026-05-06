# Solution Landscape: hourly survey candidates

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | GitHub repo search + gating | raw 30, kept 30 | lane별 편차 존재 | top: addyosmani/agent-skills (https://github.com/addyosmani/agent-skills) |
| web-frontend-skill | GitHub repo search + gating | raw 30, kept 2 | lane별 편차 존재 | top: ceilf6/FrontAgent (https://github.com/ceilf6/FrontAgent) |
| web-backend-skill | GitHub repo search + gating | raw 30, kept 2 | lane별 편차 존재 | top: SujalPatil21/Protfolio-Website (https://github.com/SujalPatil21/Protfolio-Website) |
| cli-open-source-skill | GitHub repo search + gating | raw 20, kept 8 | lane별 편차 존재 | top: nexu-io/open-design (https://github.com/nexu-io/open-design) |
| game-development-skill | GitHub repo search + gating | raw 30, kept 1 | lane별 편차 존재 | top: viktor-ferenczi/se-dev-skills (https://github.com/viktor-ferenczi/se-dev-skills) |

## Categories
- agentic/web/frontend/backend/cli/game 5개 lane 고정 조사

## What People Actually Use
- 고별점(stars) + 최근 push + 명시 라이선스가 있는 저장소가 실제 채택 후보로 수렴함. (indexed snippet)

## Frequency Ranking
1. web-frontend-skill
2. cli-open-source-skill
3. agentic-ai-skill
4. web-backend-skill
5. game-development-skill

## Key Gaps
- 일부 lane은 추천 0건으로 degraded 발생.
- no-checks-reported PR 관측 시 병목 증가.

## Contradictions
- 검색 recall을 넓히면 low-fit가 늘고, 정밀 게이트를 강화하면 추천 수가 급감.

## Key Insight
- token-overlap + negation guard + freshness(24개월) + license normalize 조합이 저위험 자동화 품질에 유효.

Provenance: indexed snippet, direct page retrieval