# Context: oh-my-skills hourly survey

## Workflow Context
매시간 5개 lane(agentic/web-frontend/web-backend/cli/game) 검색 결과를 수집하고, 추천 후보는 신호(스타/신선도/비보관)와 적합성 게이트를 통과해야 한다. provenance: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 후보 검토 및 PR 머지 | Advanced |
| Automation operator | 정기 실행 모니터링 | Intermediate |

## Current Workarounds
1. 키워드 검색 후 수동 선별.
2. low-fit 사례를 PR 리뷰에서 사후 제거.

## Adjacent Problems
- lane별 검색 편향으로 단일 lane 집중 발생.
- 라이선스/신선도 누락으로 추천 품질 저하.

## User Voices
- "survey-first로 찾고 실제 변경/PR/머지까지 자동화" — scheduler requirement (thin evidence)
