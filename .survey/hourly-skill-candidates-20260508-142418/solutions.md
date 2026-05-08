# Solution Landscape: oh-my-skills hourly survey loop

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | GH search + relevance/signal/freshness gate | raw=30, kept=6, median_stars=0.0 | lane_status=pass causes=none | Provenance: indexed snippet |
| web-frontend-skill | GH search + relevance/signal/freshness gate | raw=5, kept=1, median_stars=0 | lane_status=pass causes=none | Provenance: indexed snippet |
| web-backend-skill | GH search + relevance/signal/freshness gate | raw=1, kept=0, median_stars=7532 | lane_status=degraded causes=low-fit,stale | Provenance: indexed snippet |
| cli-open-source-skill | GH search + relevance/signal/freshness gate | raw=1, kept=1, median_stars=33481 | lane_status=pass causes=none | Provenance: indexed snippet |
| game-development-skill | GH search + relevance/signal/freshness gate | raw=30, kept=3, median_stars=0.0 | lane_status=pass causes=none | Provenance: indexed snippet |

## Categories
- Discovery coverage: five mandatory keyword lanes
- Quality gates: fit/signal/freshness/archived/license checks
- PR operations: open-PR hard gate + checks blocker flow

## What People Actually Use
- GH-native search and PR checks are sufficient for unattended baseline execution. Provenance: direct page retrieval.

## Frequency Ranking
1. Open PR check triage
2. Lane discovery and filtering
3. Blocker comment updates when checks are absent

## Key Gaps
- Some lanes can remain degraded despite recovery; recommendations become concentrated.
- CI checks may be absent on hourly branches, blocking merge completion.

## Contradictions
- Broad recall wants permissive discovery, but recommendation quality requires strict filtering.

## Key Insight
A deterministic open-PR gate artifact plus lane-metric reporting reduces reviewer ambiguity in no-checks scenarios without pausing development cadence.
