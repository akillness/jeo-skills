# Solutions
## Solution List
1. Keep current keyword lanes but add cross-lane recommendation dedupe (one repo counted once globally, with primary lane assignment).
2. Add explicit lane-overlap reporting so duplicated repos remain visible as evidence but are not double-counted in recommendation health metrics.
3. Keep raw discovery entries untouched; apply dedupe only after relevance gate for recommendation-grade lists.

## Categories
- process hardening
- metric integrity
- recommendation quality

## What People Actually Use
- Most discovered repos are low-signal (0 stars) or missing license metadata; maintainers already rely on manual judgement before merge.
- High-signal repos exist but are sparse; quality depends on preventing duplicated promotion across lanes.

## Frequency Ranking
- agentic ai skill: lane_status=pass, kept_count=4, raw_count=10, median_stars_raw=0, zero_star_raw=5, degraded_causes=['none']
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=10, median_stars_raw=0, zero_star_raw=7, degraded_causes=['low-signal-saturation', 'license']
- web backend skill: lane_status=degraded, kept_count=0, raw_count=10, median_stars_raw=0, zero_star_raw=10, degraded_causes=['low-signal-saturation', 'license']
- cli open source skill: lane_status=pass, kept_count=1, raw_count=10, median_stars_raw=0, zero_star_raw=5, degraded_causes=['none']
- game development skill: lane_status=degraded, kept_count=0, raw_count=10, median_stars_raw=0, zero_star_raw=7, degraded_causes=['low-signal-saturation', 'license']

## Key Gaps
- No explicit cross-lane dedupe contract for recommendation-grade keeps.
- Potential over-counting of recommended coverage when same repo appears in frontend/backend lanes.

## Contradictions
- The pipeline values broad discovery, but recommendation quality requires strict dedupe and lane ownership.

## Key Insight
- Separate 'evidence breadth' from 'recommendation integrity': allow duplicates in raw evidence, forbid duplicate counting in recommendation-grade summaries.

## Curated Sources
- direct page retrieval: https://docs.github.com/en/rest/search/search#search-repositories
- direct page retrieval: https://cli.github.com/manual/gh_api
- direct page retrieval: https://github.com/akillness/oh-my-skills/.agent-skills/survey/SKILL.md
- indexed snippet: .survey/hourly-skill-candidates-20260428-2040/evidence.json
