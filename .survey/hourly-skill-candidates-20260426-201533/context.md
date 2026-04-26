# Context
## Workflow Context
Hourly loop: sync repo -> survey keyword lanes -> collect evidence -> choose one low-risk skill change -> PR + self-review + merge.

## Affected Users
- Maintainers reviewing hourly PRs
- Agents depending on stable survey quality gates

## Current Workarounds
- Manual triage of noisy lanes
- Repeated ad-hoc tweaks to degraded-cause reporting

## Adjacent Problems
- Open-PR accumulation from partially merged hourly runs
- Recommendation quality drift when raw discovery is dominated by low-signal repos

## User Voices
- Requires survey-based candidate search each run with evidence
- Requires PR lifecycle to include review and merge when quality gate passes

## Lane Health Snapshot
- agentic ai skill: lane_status=pass, kept_count=3, raw_count=20, median_stars_raw=0, zero_star_raw=12
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0, zero_star_raw=3
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- cli open source skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- game development skill: lane_status=pass, kept_count=1, raw_count=20, median_stars_raw=2, zero_star_raw=10
- single_lane_concentration: false (recommended_lane_count=2)
- Provenance: indexed snippet (gh search) + direct page retrieval (gh api repos/<owner>/<repo>)
