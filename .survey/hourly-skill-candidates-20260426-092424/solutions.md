# Solution Landscape: oh-my-skills hourly maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | agentic ai skill candidate | stars=14, license=Apache-2.0 | lane coverage evidence | limited lane breadth risk | provenance: indexed snippet + direct page retrieval |
| (none kept) web frontend skill | recovery query path | preserved raw evidence | transparent degraded reporting | recommendation scarcity | provenance: indexed snippet |
| (none kept) web backend skill | recovery query path | preserved raw evidence | transparent degraded reporting | recommendation scarcity | provenance: indexed snippet |
| guarinogabriel/Mac-CLI | cli open source skill candidate | stars=9062, license=MIT | lane coverage evidence | limited lane breadth risk | provenance: indexed snippet + direct page retrieval |
| tjboudreaux/cc-plugin-unity-gamedev | game development skill candidate | stars=3, license=MIT | lane coverage evidence | limited lane breadth risk | provenance: indexed snippet + direct page retrieval |

## Categories
- agentic ai skill: candidate promotion
- web frontend skill: degraded evidence triage
- web backend skill: degraded evidence triage
- cli open source skill: candidate promotion
- game development skill: candidate promotion

## What People Actually Use
GitHub-native survey retrieval (`gh search repos` + `gh api repos/{owner}/{repo}`) for hourly loops with metadata gating (provenance: indexed snippet, direct page retrieval).

## Frequency Ranking
1. agentic ai skill — kept_count=3 raw_count=20 lane_status=pass
1. cli open source skill — kept_count=1 raw_count=1 lane_status=degraded
1. game development skill — kept_count=1 raw_count=20 lane_status=pass
1. web frontend skill — kept_count=0 raw_count=4 lane_status=degraded
1. web backend skill — kept_count=0 raw_count=0 lane_status=degraded

## Key Gaps
- web frontend skill: degraded_causes=license,low-signal,low-fit,stale
- web backend skill: degraded_causes=no-results
- cli open source skill: degraded_causes=low-signal

## Contradictions
- Broad recall vs recommendation-grade strictness: many hits exist but fail metadata/signal gates.
- CLI lane has high-quality keep but misses spotlight target(>=3), so lane remains degraded.

## Key Insight
Recommendation coverage remains uneven (recommended_lane_count=3, single_lane_concentration=false); enforcement should prioritize deterministic degraded-cause reporting and lane-threshold transparency.
