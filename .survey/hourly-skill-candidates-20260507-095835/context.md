# Context: oh-my-skills hourly survey maintenance

## Workflow Context
- 5개 lane 고정 키워드 탐색 후 metadata/freshness/signal gate를 적용함 (provenance: indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 스킬 품질 검수 및 머지 판단 | Advanced |
| Automation Runner | 시간별 리포트/PR 생성 | Intermediate |

## Current Workarounds
1. 단순 키워드 탐색 결과를 수동 선별.

## Adjacent Problems
- 체크 미보고 PR 누적으로 merge throughput 저하.

## User Voices
- "제안-only로 끝내지 말고 실제 변경+PR까지" — 운영 요구사항.
