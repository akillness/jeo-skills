# Context: oh-my-skills hourly survey loop

## Workflow Context
- 5개 lane(Agentic/Frontend/Backend/CLI/Game)을 7일 윈도우로 조사하고, relevance gate(license/freshness/signal/intent)를 통과한 후보만 추천 목록으로 유지한다.
- 조사 소스는 GitHub 검색 결과 중심이며 provenance는 `indexed snippet`으로 기록했다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | survey 품질 게이트 유지, PR 검토/머지 | Advanced |
| Cron Agent | 매시간 조사/아티팩트/PR 자동화 | Advanced |

## Current Workarounds
1. lane별 noisy hit를 수동 필터링
2. 체크 부재 시 merge 보류 후 blocker 기록

## Adjacent Problems
- lane마다 raw_count는 충분해도 kept_count가 0이 되는 저적합(low-fit) 쏠림
- 단일 lane 집중(single_lane_concentration) 발생 시 커버리지 과장 위험

## User Voices
- "proposal-only로 끝내지 말고 실제 변경 + PR까지 진행" — 운영 요구사항
- "모든 근거는 링크와 함께" — 운영 요구사항
