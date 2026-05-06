# Context: oh-my-skills hourly survey

## Workflow Context
매 1시간 실행되는 cron이 후보 탐색→아티팩트 생성→PR→체크 확인→머지까지 수행한다. 현재는 checks 부재 이슈가 있어 merge gate가 자주 차단된다. (provenance: direct page retrieval)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 스킬 품질 승인/머지 | Advanced |
| Contributor bot | 후보 탐색/아티팩트 생성 | Intermediate |

## Current Workarounds
1. lane별 raw 결과를 수작업으로 비교해 저적합(low-fit) 후보를 제거한다.
2. checks 부재 시 PR 코멘트로 차단 사유를 수동 기재한다.

## Adjacent Problems
- 검색 결과 스키마 차이로 license 판정이 흔들릴 수 있다.
- lane 토큰이 있어도 부정문(no cli) 맥락인 경우 오탐이 생긴다.

## User Voices
- "survey-first는 유지하되 merge는 게이트 통과 시에만" — 운영 요구사항 (provenance: thin evidence)
