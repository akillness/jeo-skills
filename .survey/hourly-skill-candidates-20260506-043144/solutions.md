# Solution Landscape: oh-my-skills hourly survey loop

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| addyosmani/agent-skills | lane:agentic-ai-skill | stars 28824, license mit | low-risk reusable reference | [link](https://github.com/addyosmani/agent-skills) |
| pinchbench/skill | lane:agentic-ai-skill | stars 1096, license mit | low-risk reusable reference | [link](https://github.com/pinchbench/skill) |
| ceilf6/FrontAgent | lane:web-frontend-skill | stars 94, license mit | low-risk reusable reference | [link](https://github.com/ceilf6/FrontAgent) |
| codewith-salman/Easybank-Digital-Website | lane:web-frontend-skill | stars 3, license apache-2.0 | low-risk reusable reference | [link](https://github.com/codewith-salman/Easybank-Digital-Website) |
| SujalPatil21/Protfolio-Website | lane:web-backend-skill | stars 4, license mit | low-risk reusable reference | [link](https://github.com/SujalPatil21/Protfolio-Website) |
| Gaku52/software-engineering-universe | lane:web-backend-skill | stars 5, license other | low-risk reusable reference | [link](https://github.com/Gaku52/software-engineering-universe) |
| nexu-io/open-design | lane:cli-open-source-skill | stars 28278, license apache-2.0 | low-risk reusable reference | [link](https://github.com/nexu-io/open-design) |
| jeremylongshore/claude-code-plugins-plus-skills | lane:cli-open-source-skill | stars 2107, license mit | low-risk reusable reference | [link](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) |
| viktor-ferenczi/se-dev-skills | lane:game-development-skill | stars 5, license mit | low-risk reusable reference | [link](https://github.com/viktor-ferenczi/se-dev-skills) |

## Categories
- Agentic/Automation
- Frontend/Backend engineering
- CLI productivity
- Game development tooling

## What People Actually Use
- GitHub-native 검색(`gh search repos`) + 메타데이터 필터링으로 유지보수 후보를 정제함. (provenance: indexed snippet)
- 추천 승격 전 license/freshness/signal/fit gate를 적용함. (provenance: direct page retrieval)

## Frequency Ranking
1. agentic-ai-skill
2. cli-open-source-skill
3. web-frontend-skill
4. web-backend-skill
5. game-development-skill

## Key Gaps
- 일부 lane에서 license/low-signal 필터로 keep 수가 급감한다.
- game lane은 추천 수가 낮아 변동성이 큼.

## Contradictions
- raw hit 수는 충분하지만 추천-grade keep 수는 낮을 수 있음.
- 최근 push가 있어도 낮은 traction으로 제외될 수 있음.

## Key Insight
- broad discovery와 recommendation-grade gating을 분리하면 커버리지와 품질을 동시에 관리할 수 있다.
