# Context: Hourly Skill Candidate Sweep

## Workflow Context
매 시간 5개 lane(agentic/web-frontend/web-backend/cli/game)을 GitHub 검색으로 조사하고, evidence.json + 구조화 markdown 아티팩트를 생성한 뒤 PR까지 진행한다. 본 런은 indexed snippet 기반 메타데이터를 사용했다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | survey 결과 검토 및 merge 판단 | advanced |
| Contributor | 후보 기반 스킬/문서 개선 반영 | intermediate |
| Automation Reviewer | 품질 게이트/증거 일치성 확인 | advanced |

## Current Workarounds
1. lane별 검색 쿼리와 recovery 쿼리를 evidence에 함께 저장해 추적한다.
2. token-overlap/negation/signal/freshness 게이트를 recommendation 승격 전에 적용한다.

## Adjacent Problems
- license 메타데이터 shape 차이로 인한 unknown 분류 노이즈
- 스타 수 편중으로 인한 lane 간 추천 불균형

## User Voices
- "proposal-only가 아니라 실제 변경 + PR + 게이트 기반 merge까지 자동 수행" — run policy
- "모든 근거는 링크와 함께 남겨라" — run policy
