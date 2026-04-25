## Workflow Context
Hourly repo-maintenance survey executed all mandatory keyword families with GitHub search evidence capture and recommendation-grade gating. (indexed snippet)

## Affected Users
- Cron maintainers validating merge safety of survey artifacts.
- Reviewers depending on `degraded_causes` to decide whether to adjust recovery templates or quality gates. (indexed snippet)

## Current Workarounds
- Reviewers infer no-result lanes indirectly from `raw_count==0` metrics.
- Manual interpretation from query logs is needed when degraded causes are empty. (indexed snippet)

## Adjacent Problems
- Lane-level recovery escalation is deterministic, but status explanation remains partially implicit when no repos are returned.
- Empty degraded-cause maps make trend reports less actionable in PR reviews. (indexed snippet)

## User Voices
- agentic ai skill: lane_status=pass, kept_count=5, raw_count=28, median_stars_raw=0.0, zero_star_raw=17 (indexed snippet)
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0.0, zero_star_raw=3 (indexed snippet)
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0 (indexed snippet)
- cli open source skill: lane_status=pass, kept_count=1, raw_count=1, median_stars_raw=9062, zero_star_raw=0 (indexed snippet)
- game development skill: lane_status=pass, kept_count=1, raw_count=25, median_stars_raw=0, zero_star_raw=14 (indexed snippet)
