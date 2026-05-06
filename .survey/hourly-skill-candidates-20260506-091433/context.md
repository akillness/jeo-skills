# Context: oh-my-skills hourly survey

## Workflow Context
- 매시간 5개 lane을 조사하고 evidence.json + 요약 아티팩트를 생성한다.
- lane별 stage-1/2 recovery 질의를 기록하고 zero-result를 degraded로 표준화한다.
- 추천 후보는 signal-floor, token overlap, freshness(24개월), license, archived 게이트를 통과해야 한다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | PR 품질 검토 및 merge 판단 | Advanced |
| Automation operator | 스케줄러/CI 안정성 관리 | Intermediate |

## Current Workarounds
1. broad query 1회 실행 후 수동 판단
2. lane 무결성 검증 없이 markdown만 확인

## Adjacent Problems
- CI checks 미보고(no checks reported) 시 merge 결정을 자동화하기 어려움
- Graphify/RTK CLI 스키마 드리프트로 산출물 공백 발생 가능

## User Voices
- "제안-only 리포트로 끝내지 말고 실제 변경과 PR까지 진행" — run policy
- "근거는 링크와 함께 남겨라" — run policy

Provenance: indexed snippet, direct page retrieval
