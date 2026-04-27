# Context: oh-my-skills hourly survey loop

## Workflow Context
- Target repo: `akillness/oh-my-skills`
- Mode: repo-maintenance hourly survey + PR loop.
- Evidence generated under `.survey/hourly-skill-candidates-20260427-145024/evidence.json` and compacted with RTK.
- This run executed all required keyword families and applied relevance/metadata/freshness/signal gates.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Curate skill updates and merge safe PRs | Advanced |
| Reviewer | Verify evidence quality and degraded-lane handling | Advanced |
| Automation Operator | Monitor unattended hourly cron outcomes | Intermediate |

## Current Workarounds
1. Manual scanning of GitHub search results per lane.
2. Ad-hoc interpretation of sparse/noisy lanes.
3. Manual PR narration for risk and rollback.

## Adjacent Problems
- Lane-level noise can hide true candidate quality drift.
- Missing explicit no-results cause can make degraded reports ambiguous.
- Transport/schema drift in external tools can break unattended runs.

## User Voices
- "hourly runs must stay deterministic and reviewer-ready" — direct page retrieval
- "keep survey evidence even when recommendations are sparse" — indexed snippet

## Lane Health Snapshot
- agentic ai skill | lane_status: pass | kept_count: 1 | raw_count: 40 | median_stars_raw: 0.0 | zero_star_raw: 29 | degraded_causes: license,low-signal
- web frontend skill | lane_status: degraded | kept_count: 0 | raw_count: 4 | median_stars_raw: 0.0 | zero_star_raw: 3 | degraded_causes: license,low-signal,stale
- web backend skill | lane_status: degraded | kept_count: 0 | raw_count: 1 | median_stars_raw: 7522 | zero_star_raw: 0 | degraded_causes: stale
- cli open source skill | lane_status: degraded | kept_count: 0 | raw_count: 0 | median_stars_raw: 0 | zero_star_raw: 0 | degraded_causes: no-results
- game development skill | lane_status: pass | kept_count: 3 | raw_count: 40 | median_stars_raw: 0.0 | zero_star_raw: 30 | degraded_causes: license,low-signal

Provenance labels used in this file: indexed snippet, direct page retrieval.
