# Context: oh-my-skills hourly survey

## Workflow Context
- 본 실행은 `repo-maintenance` 모드로 5개 키워드 lane을 모두 실행했다.
- 검색 결과는 `indexed snippet`(gh search) + `direct page retrieval`(gh api repos/{owner}/{repo}) 조합으로 수집했다.
- 추천급 후보는 license/freshness/signal/fit gate를 통과한 항목만 유지했다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 스킬 품질 유지, PR 리뷰/머지 | Advanced |
| Contributor | 신규/개선 스킬 작성 | Intermediate |
| Automation operator | hourly cron 안정성 관리 | Advanced |

## Current Workarounds
1. lane별 primary query 실패/노이즈 시 stage1 recovery query를 실행.
2. kept_count==0이면 stage2 query로 1회 추가 복구.
3. validator와 diff check로 최소 품질 게이트를 강제.

## Adjacent Problems
- lane별 노이즈 편차로 추천 후보가 단일 lane에 집중될 수 있음.
- game lane은 stage2 템플릿이 약하면 회복 탄력성이 낮아질 수 있음.
- 도구 체인(Obsidian URI, Graphify query) 실패 시 fallback artifact 누락 위험.

## User Voices
- "주기 실행에서도 근거 링크와 provenance가 유지되어야 한다." — direct page retrieval
- "검색이 흔들려도 최소한 lane 상태와 원인은 보여야 한다." — indexed snippet

## Lane Health Snapshot
- `agentic ai skill`: lane_status=pass, kept_count=2, raw_count=10, median_stars_raw=0, zero_star_raw=6
- `web frontend skill`: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0, zero_star_raw=3
- `web backend skill`: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- `cli open source skill`: lane_status=degraded, kept_count=2, raw_count=5, median_stars_raw=828, zero_star_raw=0
- `game development skill`: lane_status=degraded, kept_count=0, raw_count=11, median_stars_raw=5, zero_star_raw=3
