## Solution List
- Keep current metadata/freshness gates and add an explicit recommendation-grade signal floor (stars >= 3 by default).
- Expand degraded cause taxonomy/reporting to include `low-signal` for reviewer clarity.
- Add evaluator coverage for low-signal noisy lanes to prevent regressions.

## Categories
- Process hardening
- Evidence quality gating
- Cron safety and determinism

## What People Actually Use
- GitHub-native search (`gh search repos`) with lane-specific recovery queries.
- Explicit lane metrics and deterministic rescue triggers for unattended runs.

## Frequency Ranking
1. Metadata/recency filtering (already stable)
2. Lane rescue query templates (stable)
3. Signal-floor filtering (needs stronger codification)

## Key Gaps
- Existing survey docs emphasize license/stale/fit but under-specify low-signal suppression for recommendation-grade keeps.

## Contradictions
- Broad recall wants inclusive discovery evidence, while merge-ready recommendations need stricter quality gates.

## Key Insight
- Preserve broad raw evidence, but enforce stricter recommendation-grade keeps with explicit low-signal reporting to reduce reviewer load.

## Provenance
- direct page retrieval (GitHub search API)
- thin evidence used only as fallback label in contract text; not used for final kept candidates in this run.
