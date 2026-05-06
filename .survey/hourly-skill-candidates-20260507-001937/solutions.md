# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| addyosmani/agent-skills | agentic-ai-skill 적합 후보 | stars=29622, fresh<=24m | lane 기준 충족 | https://github.com/addyosmani/agent-skills (provenance: indexed snippet) |
| pinchbench/skill | agentic-ai-skill 적합 후보 | stars=1101, fresh<=24m | lane 기준 충족 | https://github.com/pinchbench/skill (provenance: indexed snippet) |
| rinafcode/teachLink_web | web-frontend-skill 적합 후보 | stars=14, fresh<=24m | lane 기준 충족 | https://github.com/rinafcode/teachLink_web (provenance: indexed snippet) |
| ceilf6/FrontAgent | web-frontend-skill 적합 후보 | stars=94, fresh<=24m | lane 기준 충족 | https://github.com/ceilf6/FrontAgent (provenance: indexed snippet) |
| SujalPatil21/Protfolio-Website | web-backend-skill 적합 후보 | stars=4, fresh<=24m | lane 기준 충족 | https://github.com/SujalPatil21/Protfolio-Website (provenance: indexed snippet) |
| Gaku52/software-engineering-universe | web-backend-skill 적합 후보 | stars=5, fresh<=24m | lane 기준 충족 | https://github.com/Gaku52/software-engineering-universe (provenance: indexed snippet) |
| nexu-io/open-design | cli-open-source-skill 적합 후보 | stars=29838, fresh<=24m | lane 기준 충족 | https://github.com/nexu-io/open-design (provenance: indexed snippet) |
| jeremylongshore/claude-code-plugins-plus-skills | cli-open-source-skill 적합 후보 | stars=2111, fresh<=24m | lane 기준 충족 | https://github.com/jeremylongshore/claude-code-plugins-plus-skills (provenance: indexed snippet) |
| viktor-ferenczi/se-dev-skills | game-development-skill 적합 후보 | stars=5, fresh<=24m | lane 기준 충족 | https://github.com/viktor-ferenczi/se-dev-skills (provenance: indexed snippet) |
| Yuki001/game-dev-skills | game-development-skill 적합 후보 | stars=13, fresh<=24m | lane 기준 충족 | https://github.com/Yuki001/game-dev-skills (provenance: indexed snippet) |

## Categories
- Agentic AI skill, Web Frontend skill, Web Backend skill, CLI OSS skill, Game Dev skill

## What People Actually Use
- 실사용 후보는 stars/freshness/intent를 동시에 만족한 저장소에 집중된다 (provenance: indexed snippet).

## Frequency Ranking
1. CLI/Agentic lane에서 추천 가능 후보가 상대적으로 안정적으로 등장
2. 일부 lane은 noisy match로 keep 0이 반복될 수 있음

## Key Gaps
- lane별 recovery query 표준화는 있으나, low-fit 분류 근거의 문서화 일관성이 더 필요

## Contradictions
- 검색 hit 수가 많아도 추천-grade keep가 0일 수 있음(토큰 겹침/negation/low-signal)

## Key Insight
- raw discovery와 recommendation-grade를 분리 유지하면 coverage와 품질을 동시에 관리할 수 있다.
