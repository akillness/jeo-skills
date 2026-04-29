# Context: hourly skill candidate sweep

## Workflow Context
This run executes the mandatory five keyword families, keeps broad discovery evidence, and applies metadata+signal gates before recommendations (indexed snippet; direct page retrieval).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Improve skills with low-risk PRs | advanced |
| Reviewer | Verify provenance, risks, and merge-gate health | advanced |

## Current Workarounds
1. Manual interpretation when lanes degrade under noisy hits.
2. Ad-hoc query tweaks when lane raw_count is sparse.

## Adjacent Problems
- Retrieval sparsity can look like ecosystem weakness instead of search drift.
- Low-signal repositories can dominate broad keyword hits.

## User Voices
- "Keep all five keyword lanes every run and preserve raw evidence." — indexed snippet
- "Use license/freshness/signal/fit gating before recommendation promotion." — direct page retrieval

## Lane Health Snapshot
- agentic ai skill: lane_status=pass, kept_count=2, raw_count=20, median_stars_raw=0.0, zero_star_raw=12
- web frontend skill: lane_status=pass, kept_count=1, raw_count=4, median_stars_raw=0.0, zero_star_raw=3
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- cli open source skill: lane_status=pass, kept_count=3, raw_count=3, median_stars_raw=2704, zero_star_raw=0
- game development skill: lane_status=pass, kept_count=4, raw_count=20, median_stars_raw=1.0, zero_star_raw=10
- cross-lane: recommended_lane_count=4, single_lane_concentration=False
