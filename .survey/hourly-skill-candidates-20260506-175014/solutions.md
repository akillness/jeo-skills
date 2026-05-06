# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| addyosmani/agent-skills | lane-token + freshness + license + signal gate | stars 28932 | checks dependency | https://github.com/addyosmani/agent-skills |
| pinchbench/skill | lane-token + freshness + license + signal gate | stars 1098 | checks dependency | https://github.com/pinchbench/skill |
| mvanhorn/last30days-skill | lane-token + freshness + license + signal gate | stars 24869 | checks dependency | https://github.com/mvanhorn/last30days-skill |
| ceilf6/FrontAgent | lane-token + freshness + license + signal gate | stars 94 | checks dependency | https://github.com/ceilf6/FrontAgent |
| codewith-salman/Easybank-Digital-Website | lane-token + freshness + license + signal gate | stars 3 | checks dependency | https://github.com/codewith-salman/Easybank-Digital-Website |
| SujalPatil21/Protfolio-Website | lane-token + freshness + license + signal gate | stars 4 | checks dependency | https://github.com/SujalPatil21/Protfolio-Website |
| Gaku52/software-engineering-universe | lane-token + freshness + license + signal gate | stars 5 | checks dependency | https://github.com/Gaku52/software-engineering-universe |
| nexu-io/open-design | lane-token + freshness + license + signal gate | stars 28990 | checks dependency | https://github.com/nexu-io/open-design |
| jeremylongshore/claude-code-plugins-plus-skills | lane-token + freshness + license + signal gate | stars 2107 | checks dependency | https://github.com/jeremylongshore/claude-code-plugins-plus-skills |
| TerminalSkills/skills | lane-token + freshness + license + signal gate | stars 40 | checks dependency | https://github.com/TerminalSkills/skills |

## Categories
- agentic/web/backend/cli/game lane 기반 분류

## What People Actually Use
- stars, pushedAt, archived, license, lane-token-overlap을 동시에 보는 다중 게이트를 사용한다.

## Frequency Ranking
1. web/backend + agentic 계열 저장소가 높은 빈도로 탐지됨
2. cli/game lane은 검색 잡음이 상대적으로 큼

## Key Gaps
- checks 미보고(no checks reported) 환경에서 merge가 지속적으로 막힘
- lane별 recovery query는 수행되지만 일부 lane은 low-fit 비율이 높음

## Contradictions
- 검색 노출 빈도는 높지만 실제 recommendation-grade로 승격되는 비율은 낮다.

## Key Insight
- 추천 품질은 검색량보다 lane-intent/negation/freshness 결합 게이트의 엄격도에 크게 좌우된다. (provenance: indexed snippet)
