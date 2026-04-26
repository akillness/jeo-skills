# Context: hourly skill candidate sweep

## Workflow Context
Hourly cron run executes a repo-maintenance survey, then uses the evidence package as the only source of truth for a low-risk skill update.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Curate skill quality and merge safe PRs | advanced |
| Automation reviewer | Verify evidence quality gates and provenance | advanced |

## Current Workarounds
1. Manual lane-by-lane browsing when keyword lanes are sparse or noisy.
2. Ad-hoc judgment on whether lane concentration is acceptable.

## Adjacent Problems
- Recovery queries can still leave recommendation keeps concentrated in a subset of lanes.
- Without explicit concentration framing, reports can look healthier than they are.

## User Voices
- "Keep evidence even when recommendation-grade keeps are thin, but report degraded causes explicitly." — indexed snippet
- "Use metadata and strict gates, don’t weaken quality thresholds to force green lanes." — direct page retrieval

## Lane Health Snapshot
- agentic ai skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- cli open source skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- game development skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
