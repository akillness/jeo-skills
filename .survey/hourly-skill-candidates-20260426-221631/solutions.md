# Solution Landscape: hourly skill candidate sweep

## Solution List
| Lane | Approach | Top Keep | lane_status | degraded_causes |
|------|----------|----------|-------------|-----------------|
| agentic ai skill | keyword sweep + relevance rescue + metadata gate | AbdelhakRazi/flutter-bloc-clean-architecture-skill | pass | low-fit:5, low-signal:17 |
| web frontend skill | keyword sweep + relevance rescue + metadata gate | amrrs/cinematic-webscroll-frontend-skill | pass | low-fit:2, low-signal:3, stale:1 |
| web backend skill | keyword sweep + relevance rescue + metadata gate | — | degraded | no-results:1 |
| cli open source skill | keyword sweep + relevance rescue + metadata gate | ohmyzsh/ohmyzsh | pass | none |
| game development skill | keyword sweep + relevance rescue + metadata gate | rohithnafeel/My-CS-Projects | pass | archived:1, low-signal:13, stale:9 |

## Categories
- Recommendation-grade keeps: pass license + freshness + signal + fit gate.
- Discovery-only evidence: preserved for audit, excluded from recommendation set.

## What People Actually Use
Maintainers rely on GitHub search listings (indexed snippet) plus repo/API detail retrieval (direct page retrieval) to stabilize hourly surveys.

## Frequency Ranking
1. game development skill
2. cli open source skill
3. agentic ai skill
4. web frontend skill
5. web backend skill

## Key Gaps
- Multiple lanes can remain degraded when discovery quality is mostly low-signal or license-unclear.
- Cross-lane concentration risk appears when recommendations cluster in too few lanes.

## Contradictions
- Broad recall improves coverage but raises noise; strict gates improve reliability but can reduce pass rate.

## Key Insight
Codify a deterministic lane-level `no-results` degraded cause to avoid ambiguous degraded reporting when raw_count stays zero after recovery.

## Curated Sources
- AbdelhakRazi/flutter-bloc-clean-architecture-skill — https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (indexed snippet; direct page retrieval)
- VoDaiLocz/Enhance-Prompt — https://github.com/VoDaiLocz/Enhance-Prompt (indexed snippet; direct page retrieval)
- amrrs/cinematic-webscroll-frontend-skill — https://github.com/amrrs/cinematic-webscroll-frontend-skill (indexed snippet; direct page retrieval)
- ohmyzsh/ohmyzsh — https://github.com/ohmyzsh/ohmyzsh (indexed snippet; direct page retrieval)
- r3bl-org/r3bl-open-core — https://github.com/r3bl-org/r3bl-open-core (indexed snippet; direct page retrieval)
- rohithnafeel/My-CS-Projects — https://github.com/rohithnafeel/My-CS-Projects (indexed snippet; direct page retrieval)
- inchussa/Virtual-Pet-Simulator — https://github.com/inchussa/Virtual-Pet-Simulator (indexed snippet; direct page retrieval)
