# Solution Landscape: hourly skill candidate sweep

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic ai skill | keyword sweep + recovery templates | deterministic gate and lane metrics | lane can degrade when retrieval/noise dominates | top keep: —; degraded_causes: license:14, low-fit:4, low-signal:18 |
| web frontend skill | keyword sweep + recovery templates | deterministic gate and lane metrics | lane can degrade when retrieval/noise dominates | top keep: —; degraded_causes: license:3, low-signal:3, stale:1 |
| web backend skill | keyword sweep + recovery templates | deterministic gate and lane metrics | lane can degrade when retrieval/noise dominates | top keep: —; degraded_causes: none |
| cli open source skill | keyword sweep + recovery templates | deterministic gate and lane metrics | lane can degrade when retrieval/noise dominates | top keep: guarinogabriel/Mac-CLI; degraded_causes: license:1, low-fit:1, stale:2 |
| game development skill | keyword sweep + recovery templates | deterministic gate and lane metrics | lane can degrade when retrieval/noise dominates | top keep: codewith-salman/Rescuer-Game; degraded_causes: license:16, low-signal:17 |

## Categories
- Recommendation-grade keeps: pass strict license/freshness/signal/fit gate.
- Discovery-only evidence: preserved but excluded due to degraded-causes.

## What People Actually Use
Maintainers use GitHub-native repo search plus REST metadata fallback to keep runs deterministic under tool drift.

## Frequency Ranking
1. cli open source skill
2. web backend skill
3. web frontend skill
4. game development skill
5. agentic ai skill

## Key Gaps
- Retrieval-command schema drift can zero-out raw_count before relevance gates even run.
- Some lanes remain degraded due to low-fit or stale candidates despite recovery queries.

## Contradictions
- Broad search increases recall but raises low-fit noise; stricter gates preserve quality while reducing lane pass rate.

## Key Insight
Add an explicit GH JSON-field compatibility note to survey guidance so hourly loops can recover quickly when CLI schema drift breaks retrieval commands.

## Curated Sources
- guarinogabriel/Mac-CLI — https://github.com/guarinogabriel/Mac-CLI (indexed snippet; direct page retrieval)
- abhixdd/ghgrab — https://github.com/abhixdd/ghgrab (indexed snippet; direct page retrieval)
- codewith-salman/Rescuer-Game — https://github.com/codewith-salman/Rescuer-Game (indexed snippet; direct page retrieval)
- tjboudreaux/cc-plugin-unity-gamedev — https://github.com/tjboudreaux/cc-plugin-unity-gamedev (indexed snippet; direct page retrieval)
