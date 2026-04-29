## Solution List
- Add `no-results` to degraded-cause taxonomy so empty lanes are reported deterministically.
- Require explicit `no-results` when `raw_count == 0` after documented recovery queries.
- Add eval coverage so survey skill behavior cannot regress on empty-lane reporting.

## Categories
- Process hardening
- Evidence quality gating
- Cron determinism

## What People Actually Use
- GitHub-native lane sweeps (`gh search repos`) with deterministic stage-1/stage-2 recovery templates.
- Lane-level metrics and cause-based degraded reporting for merge-ready reviewer summaries.

## Frequency Ranking
1. Low-signal noise filtering (already codified)
2. Lane-level pass/degraded reporting (codified)
3. Empty-lane no-results codification (needs explicit taxonomy parity)

## Key Gaps
- Current docs and skill compact taxonomies inconsistently encode no-results for raw_count==0 lanes.

## Contradictions
- Broad discovery coverage wants inclusion; reviewer triage needs strict semantic causes for empty lanes.

## Key Insight
- `raw_count == 0` after deterministic recovery is a unique diagnostic state and should map to `no-results` explicitly, not implicit absence.

## Provenance
- direct page retrieval (GitHub search API)
- indexed snippet (reserved fallback label)
- thin evidence (reserved fallback label)
