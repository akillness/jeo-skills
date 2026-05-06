# Context: oh-my-skills hourly survey maintenance

## Workflow Context
매 시간 5개 lane을 조사하고 후보를 필터링한 뒤, 아티팩트/PR/체크/머지까지 진행한다. 본 런은 `gh search repos` 기반으로 증거를 수집했고, lane별 상태를 계량 지표와 함께 기록했다 (provenance: indexed snippet, feed recovery).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 스킬 품질/자동화 안정성 관리 | Advanced |
| Reviewer | PR 품질 게이트 검토 | Intermediate |
| Cron Operator | 무인 실행 모니터링 | Intermediate |

## Current Workarounds
1. 체크가 없는 PR은 수동 확인 후 보류 처리.
2. lane 품질 저하 시 recovery query를 추가 실행.
3. provenance 라벨을 markdown에 명시해 validator 통과를 보장.

## Adjacent Problems
- 검색 결과 노이즈 증가로 low-fit 필터링 비용 상승.
- check 미구성 저장소에서 merge 자동화가 상시 차단됨.

## User Voices
- "no checks reported가 반복되면 merge를 막고 원인을 명시해라" — 운영 정책
- "제안-only가 아니라 실제 변경/PR까지 진행해라" — 런 정책
