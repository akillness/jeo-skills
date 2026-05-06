# Context: hourly skill survey maintenance

## Workflow Context
매 시간 5개 lane을 조사하고 evidence/artifact를 생성한 뒤 PR 생성과 게이트 판단을 수행한다. 조사 근거는 GitHub 검색 결과를 기준으로 한다. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 후보 조사/큐레이션/PR 머지 | 중급 |
| Automation Bot | 정기 실행/아티팩트 생성/검증 | 중급 |

## Current Workarounds
1. 수동으로 후보를 추려 lane 적합성을 재검토한다.
2. 체크 부재 시 머지를 보류하고 후속 런에서 재확인한다.

## Adjacent Problems
- 라이선스 필드 shape 차이로 인한 오분류
- stale 저장소가 추천에 섞이는 문제

## User Voices
- "제안-only로 끝내지 말고 구현 변경까지 진행" — 운영 지시
- "모든 근거는 링크와 함께 남겨야 함" — 운영 지시
