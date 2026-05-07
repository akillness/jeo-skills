# Context: hourly skill survey maintenance

## Workflow Context
매 시간 5개 lane을 조사하고 evidence 아티팩트를 누적한다. 이번 런은 open PR 존재로 신규 PR 생성이 금지되어 기존 PR 브랜치에 carry-forward 한다. provenance: indexed snippet

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | survey 결과 검토/병합 | intermediate |
| Automation Operator | cron 안정성 유지 | advanced |

## Current Workarounds
1. open PR에 직접 아티팩트를 누적 커밋
2. checks 미보고 시 blocker 코멘트로 병합 차단

## Adjacent Problems
- lane별 검색 결과 0건 발생 시 no-results 원인 분류 누락 가능
- recovery query 실행 흔적 누락 시 감사 어려움

## User Voices
- "open PR이 있으면 신규 PR 생성을 금지" — 운영 가드레일
- "모든 근거는 링크와 함께" — 운영 가드레일
