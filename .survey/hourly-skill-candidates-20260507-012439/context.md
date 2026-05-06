# Context: hourly skill survey loop

## Workflow Context
5개 lane(agentic/web-frontend/web-backend/cli/game)에서 GitHub 검색으로 원시 후보를 수집하고, 신호 바닥/의도 토큰/신선도/라이선스 게이트를 거쳐 추천으로 승격한다. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 주기적 스킬 품질 유지 | advanced |
| Contributor | 후보 검토 및 문서화 | intermediate |

## Current Workarounds
1. 제안-only 산출물로 종료
2. lane별 저적합 후보를 수동 제외

## Adjacent Problems
- checks 미보고 PR 누적 시 backlog churn 증가
- provenance 표기 누락 시 validator 실패

## User Voices
- "제안-only로 끝내지 말고 실제 변경/PR/merge까지" — scheduled instruction
