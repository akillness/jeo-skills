# Context: oh-my-skills hourly candidate sweep

## Workflow Context
- hourly survey -> evidence.json -> skill/reference patch -> PR/merge 루프를 실행한다.
- 검색은 GitHub-native `gh search repos`로 수행했고 provenance는 direct page retrieval/feed recovery로 기록했다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 스킬 품질 게이트 유지 | advanced |
| Cron agent operator | 자동 PR/머지 루프 운영 | intermediate |

## Current Workarounds
1. lane별 노이즈가 높으면 임시 쿼리를 수동 작성한다.
2. degraded 원인 taxonomy를 실행마다 사람이 해석한다.

## Adjacent Problems
- license 누락 저장소 다수로 keep 후보가 급감한다.
- stale 후보를 예외 유지할 때 리스크 표기가 누락될 수 있다.

## User Voices
- agentic ai skill | lane_status: degraded | kept=0 | raw=40 | median_stars_raw=0.0 | zero_star_raw=26 (direct page retrieval)
- web frontend skill | lane_status: pass | kept=15 | raw=64 | median_stars_raw=4.0 | zero_star_raw=15 (direct page retrieval)
- web backend skill | lane_status: pass | kept=24 | raw=56 | median_stars_raw=56.0 | zero_star_raw=6 (direct page retrieval)
- cli open source skill | lane_status: pass | kept=28 | raw=35 | median_stars_raw=274.0 | zero_star_raw=1 (direct page retrieval)
- game development skill | lane_status: degraded | kept=0 | raw=40 | median_stars_raw=0.0 | zero_star_raw=27 (direct page retrieval)
