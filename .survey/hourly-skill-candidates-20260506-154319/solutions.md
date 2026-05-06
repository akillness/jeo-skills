# Solution Landscape: hourly skill candidate discovery

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | agentic-ai-skill 후보 | stars 16, license apache-2.0 | freshness<=24m, not archived | source: https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (indexed snippet) |
| iwe-org/skills | agentic-ai-skill 후보 | stars 7, license mit | freshness<=24m, not archived | source: https://github.com/iwe-org/skills (indexed snippet) |
| nexu-io/open-design | cli-open-source-skill 후보 | stars 28622, license apache-2.0 | freshness<=24m, not archived | source: https://github.com/nexu-io/open-design (indexed snippet) |
| tjboudreaux/cc-plugin-unity-gamedev | game-development-skill 후보 | stars 3, license mit | freshness<=24m, not archived | source: https://github.com/tjboudreaux/cc-plugin-unity-gamedev (indexed snippet) |

## Categories
- agentic ai
- web frontend
- web backend
- cli open source
- game development

## What People Actually Use
GitHub 상에서 stars/freshness/license 신호가 있는 오픈소스를 우선 채택한다. 근거 수집은 indexed snippet을 사용한다.

## Frequency Ranking
1. web frontend/backend lane 결과가 상대적으로 풍부
2. agentic/cli/game lane은 시점에 따라 변동 폭이 큼

## Key Gaps
- 일부 lane에서 low-fit 필터링 비율이 높아 추천 밀도가 낮아질 수 있음
- checks 미보고 시 merge 자동화 불가

## Contradictions
- 검색 recall을 넓히면 low-fit/noise가 증가
- 신호 임계치(stars>=3)를 엄격히 적용하면 신규 후보 포착이 늦어짐

## Key Insight
lane-intent overlap + negation guard + freshness/license gate를 함께 적용해야 추천 품질이 안정화된다. (provenance: indexed snippet)
