# Context: oh-my-skills hourly survey loop

## Workflow Context
매 1시간 실행으로 5개 키워드 lane 조사 후, 근거 아티팩트 생성·검증·PR·리뷰·머지를 수행한다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | PR triage/merge | Intermediate |
| Automation Agent | Survey/Artifacts/Validation | Advanced |

## Current Workarounds
1. GitHub 검색 결과를 수동 선별.
2. 누락 시 재검색 쿼리를 수동 조합.

## Adjacent Problems
- lane별 추천 집중도 편중
- 증거 포맷 일관성 저하

## User Voices
- "agentic-ai: raw=30, kept=3" — direct page retrieval (GitHub Search API)
- "web-frontend: raw=4, kept=1" — direct page retrieval (GitHub Search API)
- "web-backend: raw=1, kept=1" — direct page retrieval (GitHub Search API)
- "cli-open-source: raw=2, kept=1" — direct page retrieval (GitHub Search API)
- "game-development: raw=30, kept=8" — direct page retrieval (GitHub Search API)
