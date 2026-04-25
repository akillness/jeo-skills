# Solutions
## Solution List
1. Keep current five-lane mandatory sweep and recommendation-grade gating.
2. Add explicit stage-2 recovery query guidance for repeatedly empty lanes (low-risk doc ratchet).
3. Preserve strict validator contract and provenance labels in markdown artifacts.

## Categories
- Survey quality hardening
- Deterministic fallback policy

## What People Actually Use
- GitHub-native retrieval (`gh search repos`) with direct page retrieval provenance.
- Lane-level pass/degraded scorecards with degraded cause taxonomy.

## Frequency Ranking
- agentic: kept=6, raw=33, median_stars_raw=0, zero_star_raw=21, lane_status=pass
- frontend: kept=0, raw=4, median_stars_raw=0.0, zero_star_raw=3, lane_status=degraded
- backend: kept=0, raw=0, median_stars_raw=0, zero_star_raw=0, lane_status=degraded
- cli: kept=2, raw=5, median_stars_raw=826, zero_star_raw=0, lane_status=degraded
- game: kept=1, raw=30, median_stars_raw=0.0, zero_star_raw=17, lane_status=pass

## Key Gaps
- Backend lane has repeated low/zero discovery under current recovery template.
- Recovery depth expectations are implicit; add explicit stage-2 fallback template.

## Contradictions
- Broad discovery can be non-empty while recommendation-grade keeps remain empty after quality gate.
- Signal floor reduces false positives but increases degraded-lane frequency; this is intentional and should be documented.

## Key Insight
- Deterministic, multi-stage recovery templates reduce random hourly variance without weakening evidence quality gates.

## Provenance
- direct page retrieval
