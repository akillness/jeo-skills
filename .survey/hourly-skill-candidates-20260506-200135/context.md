# Context: hourly skill candidate survey

## Workflow Context
5개 lane 고정 질의를 최근 활동 저장소 중심으로 조사하고, stage-1/2 recovery를 포함해 증거를 남긴다 (provenance: indexed snippet, feed recovery).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | merge 판단 및 정책 조정 | advanced |
| Agent operator | cron 안정성 유지 | advanced |

## Current Workarounds
1. 수동 검색/필터링으로 후보 정리
2. PR 코멘트로 blocker 공유

## Adjacent Problems
- checks 미보고 PR 누적 시 머지 신뢰도 저하
- lane별 결과 편중

## User Voices
- "제안-only가 아니라 실제 반영까지" — run instruction
