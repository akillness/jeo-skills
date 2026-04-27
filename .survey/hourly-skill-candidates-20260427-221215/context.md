# Context
## Workflow Context
Hourly loop currently performs survey -> branch change -> PR create even when multiple prior hourly PRs remain open.

## Affected Users
- Repo maintainers triaging recurring hourly PRs
- Agents executing unattended merge pipelines

## Current Workarounds
- Manual review/merge of backlog PRs outside the hourly branch creation flow
- Ad-hoc carry-forward in isolated runs

## Adjacent Problems
- Open-PR accumulation dilutes reviewer focus
- New low-risk ratchets are delayed behind backlog noise

## User Voices
- Each run must perform survey-based candidate search with evidence
- Each run should complete PR review and merge when quality gates pass

## Lane Health Snapshot
- agentic ai skill: lane_status=pass, kept_count=4, raw_count=20, median_stars_raw=2.0, zero_star_raw=8
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=20, median_stars_raw=0.0, zero_star_raw=15
- web backend skill: lane_status=pass, kept_count=1, raw_count=20, median_stars_raw=0.0, zero_star_raw=17
- cli open source skill: lane_status=pass, kept_count=1, raw_count=20, median_stars_raw=1.0, zero_star_raw=9
- game development skill: lane_status=degraded, kept_count=0, raw_count=20, median_stars_raw=0.0, zero_star_raw=15
- recommended_lane_count=3
- single_lane_concentration=false
- aggregate_zero_star_ratio=0.64
- open_pr_count=29
- Provenance: indexed snippet + direct page retrieval
