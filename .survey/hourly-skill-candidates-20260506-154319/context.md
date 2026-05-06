# Context: oh-my-skills hourly survey

## Workflow Context
매시간 5개 lane을 GitHub 검색으로 조사하고 evidence/artifact를 생성한 뒤 PR까지 진행한다. 본 실행은 provenance 라벨 `indexed snippet` 기반이다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 후보 품질 검토 및 병합 | advanced |
| Automation runner | 정기 조사/아티팩트 생성 | advanced |

## Current Workarounds
1. 검색 결과를 수동 샘플링해 적합도 확인.
2. checks 미보고 PR은 merge 보류.

## Adjacent Problems
- lane별 결과 편중(single lane concentration)
- license/freshness 메타데이터 결손

## User Voices
- "근거 링크를 남기고 구현 변경까지 자동화해 달라" — hourly run directive
- "제안-only로 끝내지 말고 PR 생성까지 진행" — hourly run directive
