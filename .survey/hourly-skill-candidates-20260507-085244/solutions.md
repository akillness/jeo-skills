# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| addyosmani/agent-skills | agentic-ai-skill | stars=30397 / license=mit | 추천 | https://github.com/addyosmani/agent-skills (indexed snippet) |
| pinchbench/skill | agentic-ai-skill | stars=1102 / license=mit | 추천 | https://github.com/pinchbench/skill (indexed snippet) |
| mvanhorn/last30days-skill | agentic-ai-skill | stars=24920 / license=mit | 추천 | https://github.com/mvanhorn/last30days-skill (indexed snippet) |
| rinafcode/teachLink_web | web-frontend-skill | stars=14 / license=unknown | low-fit | https://github.com/rinafcode/teachLink_web (indexed snippet) |
| ceilf6/FrontAgent | web-frontend-skill | stars=94 / license=mit | 추천 | https://github.com/ceilf6/FrontAgent (indexed snippet) |
| dk5847001-stack/Internova-frontend | web-frontend-skill | stars=11 / license=unknown | low-fit | https://github.com/dk5847001-stack/Internova-frontend (indexed snippet) |
| SujalPatil21/Protfolio-Website | web-backend-skill | stars=4 / license=mit | low-fit | https://github.com/SujalPatil21/Protfolio-Website (indexed snippet) |
| SujalPatil21/Portfolio-Website | web-backend-skill | stars=2 / license=mit | low-fit | https://github.com/SujalPatil21/Portfolio-Website (indexed snippet) |
| Gaku52/software-engineering-universe | web-backend-skill | stars=5 / license=other | 추천 | https://github.com/Gaku52/software-engineering-universe (indexed snippet) |
| nexu-io/open-design | cli-open-source-skill | stars=30373 / license=apache-2.0 | 추천 | https://github.com/nexu-io/open-design (indexed snippet) |
| jeremylongshore/claude-code-plugins-plus-skills | cli-open-source-skill | stars=2114 / license=mit | 추천 | https://github.com/jeremylongshore/claude-code-plugins-plus-skills (indexed snippet) |
| TerminalSkills/skills | cli-open-source-skill | stars=41 / license=apache-2.0 | 추천 | https://github.com/TerminalSkills/skills (indexed snippet) |
| viktor-ferenczi/se-dev-skills | game-development-skill | stars=5 / license=mit | 추천 | https://github.com/viktor-ferenczi/se-dev-skills (indexed snippet) |
| Yuki001/game-dev-skills | game-development-skill | stars=13 / license=unknown | low-fit | https://github.com/Yuki001/game-dev-skills (indexed snippet) |
| Yakoub-ai/phaser4-gamedev | game-development-skill | stars=5 / license=unknown | low-fit | https://github.com/Yakoub-ai/phaser4-gamedev (indexed snippet) |

## Categories
- 추천 가능(high-fit): token overlap + freshness + license + signal floor 충족.
- 보류(low-fit): negation/generic/demo/no-license/stale/no-signal.

## What People Actually Use
- GitHub 검색 기반 레포 선별 + 메타데이터 게이팅이 주 흐름.
- 무인 런에서는 provenance를 `indexed snippet`/`feed recovery`로 명시해 재현성 확보.

## Frequency Ranking
1. agentic-ai-skill
2. web-frontend-skill
3. web-backend-skill
4. cli-open-source-skill
5. game-development-skill

## Key Gaps
- 일부 lane에서 low-fit/low-signal 비율이 높아 추천 품질이 흔들림.
- 저장소 checks 미설정으로 merge 자동화가 빈번히 차단됨.

## Contradictions
- 검색 노출량은 많지만 추천급 keep는 적은 lane 존재.

## Key Insight
- lane_status + degraded_causes + lane metric 동시 보고가 리뷰/추적 안정성을 크게 높인다.
