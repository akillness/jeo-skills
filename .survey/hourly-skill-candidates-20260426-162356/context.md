# Context: hourly skill candidate sweep

## Workflow Context
This run uses the required 5-keyword survey sweep, then applies deterministic relevance and metadata gates to produce recommendation-grade keeps and explicit degraded-cause reporting.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Improve skill quality via low-risk incremental PRs | advanced |
| Reviewer | Confirm evidence provenance and merge gates | advanced |

## Current Workarounds
1. Manual interpretation when lane-level keeps are sparse or noisy.
2. Ad-hoc command fixes when GitHub CLI field schemas differ across versions.

## Adjacent Problems
- Tool/schema drift can silently degrade raw retrieval quality.
- Degraded lanes can mask retrieval failures as ecosystem weakness.

## User Voices
- "Run all five keyword families every loop and keep raw evidence even when recommendations are thin." — indexed snippet
- "Use explicit metadata gate (license/freshness/signal/fit) before recommending candidates." — direct page retrieval

## Lane Health Snapshot
- agentic ai skill: lane_status=degraded, kept_count=0, raw_count=20, median_stars_raw=0.0, zero_star_raw=13
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0.0, zero_star_raw=3
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- cli open source skill: lane_status=degraded, kept_count=2, raw_count=5, median_stars_raw=830, zero_star_raw=0
- game development skill: lane_status=pass, kept_count=2, raw_count=20, median_stars_raw=0.0, zero_star_raw=15
