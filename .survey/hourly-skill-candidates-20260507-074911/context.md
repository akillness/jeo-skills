# Context: oh-my-skills hourly survey

## Workflow Context
매 1시간 주기로 5개 lane을 조사하고 evidence.json + markdown artifacts를 생성한 뒤 PR로 반영한다. 조사 소스는 GitHub 검색 결과를 사용했다 (provenance: indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 후보 검토/병합 판단 | Advanced |
| Automation Agent | 증거 수집/검증/PR 생성 | Advanced |

## Current Workarounds
1. checks 미보고 PR은 merge 보류 후 다음 런에서 재시도 (provenance: direct page retrieval)
2. lane 무결과 시 recovery query를 2단계 수행 (provenance: indexed snippet)

## Adjacent Problems
- 라이선스 필드 형태 차이로 인한 오분류
- stale 저장소가 신호 없이 추천으로 유입될 가능성

## User Voices
- "survey-first로 후보를 찾고 실제 변경 + PR까지" — run policy
- "근거는 링크와 함께" — run policy
