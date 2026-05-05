# Context: hourly skill candidate survey

## Workflow Context
이 런은 5개 고정 lane(agentic/web-frontend/web-backend/cli/game)을 GitHub 검색으로 조사하고, recovery 쿼리를 포함한 증거를 남긴다. Provenance: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 시간별 PR 검토/병합 | advanced |
| Contributor | survey 규칙 개선 | intermediate |

## Current Workarounds
1. 단순 키워드 검색 결과를 수동 필터링한다. (thin evidence)
2. lane 저품질 결과를 다음 런으로 이월한다. (thin evidence)

## Adjacent Problems
- checks 미보고 브랜치가 누적되면 병합 판단이 지연된다. (indexed snippet)
- low-fit 후보가 추천 목록에 섞이면 문서 품질이 저하된다. (indexed snippet)

## User Voices
- "근거 링크와 분류 사유를 같이 남겨야 재검토가 가능하다" — maintainers (thin evidence)
