# Context: oh-my-skills hourly survey loop

## Workflow Context
매 1시간 실행되는 조사-구현-PR 루프에서, 5개 lane을 고정 키워드로 검색하고 필터 게이트를 통과한 후보만 권고로 승격한다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | PR 검토/머지 판단 | Advanced |
| Automation Agent | 후보 조사, 산출물 생성, PR 생성 | Advanced |

## Current Workarounds
1. 제안-only 리포트로 종료되는 경우가 있어 실제 반영이 누락됨.
2. 체크 부재(no checks reported) 상태에서 PR 적체가 발생함.

## Adjacent Problems
- 라이선스 필드 스키마 차이로 unknown 오분류 가능.
- lane intent 불일치 후보가 과대 추천될 위험.

## User Voices
- "survey-first로 후보를 찾고, 실제 코드/문서 변경을 반영" — direct page retrieval
- "품질 게이트 실패 시 merge 금지" — direct page retrieval
