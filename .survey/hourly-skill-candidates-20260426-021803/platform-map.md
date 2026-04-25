## Settings
- survey mode: repo-maintenance
- evidence floor: indexed-snippets-allowed (fallback direct page retrieval)
- freshness floor: pushed_at within 24 months

## Rules
- keep 조건: license 존재, non-archived, stars>=3, lane fit 통과
- fail-safe: 검증 실패 시 merge 금지

## Hooks
- hourly cron에서 slug 고정 후 artifact/validator/PR body까지 동일 slug 재사용
- lane degraded 원인 taxonomy(license/stale/low-fit/archived/low-signal) 기록

## Platform Gaps
- recommended_lane_count=4, single_lane_concentration=false
- Graph/search API 상태에 따라 evidence provenance가 변동 가능

- Provenance labels used: indexed snippet, direct page retrieval
