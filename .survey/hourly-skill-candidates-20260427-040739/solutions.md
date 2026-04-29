# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic ai skill | Lane-specific keyword sweep + relevance gate | Fast coverage, deterministic metrics | Can pass by count under zero-star saturation | Example: AbdelhakRazi/flutter-bloc-clean-architecture-skill |
| web frontend skill | Lane-specific keyword sweep + relevance gate | Fast coverage, deterministic metrics | Can pass by count under zero-star saturation | Example: Hezekiah-Elisha/savannah_informatics_test |
| web backend skill | Lane-specific keyword sweep + relevance gate | Fast coverage, deterministic metrics | Can pass by count under zero-star saturation | Example: com-lihaoyi/cask |
| cli open source skill | Lane-specific keyword sweep + relevance gate | Fast coverage, deterministic metrics | Can pass by count under zero-star saturation | Example: cli/cli |
| game development skill | Lane-specific keyword sweep + relevance gate | Fast coverage, deterministic metrics | Can pass by count under zero-star saturation | Example: tjboudreaux/cc-plugin-unity-gamedev |

## Categories
- Quality-ratchet docs updates
- Retrieval/recovery policy updates
- Candidate scoring and lane-status logic

## What People Actually Use
- Maintainers rely on lane metrics (`kept_count`, `raw_count`, `median_stars_raw`, `zero_star_raw`) and concise recommendation lists.
- Reviewers expect explicit `degraded_causes` taxonomy and provenance labels (indexed snippet/direct page retrieval/thin evidence).

## Frequency Ranking
1. Deterministic lane-status reporting with metrics
2. Recovery-query escalation for sparse/noisy lanes
3. Cross-lane concentration and quality drift checks

## Key Gaps
- Existing guidance did not explicitly block pass-by-count under zero-star saturation.
- No dedicated eval asserted saturation downgrade behavior before this run.

## Contradictions
- A lane can have high kept_count while median stars remain zero.
- Raw recall goals can conflict with recommendation-grade quality goals.

## Key Insight
- Add a zero-star saturation guard so pass/degraded decisions require traction-aware evidence, not count alone.
