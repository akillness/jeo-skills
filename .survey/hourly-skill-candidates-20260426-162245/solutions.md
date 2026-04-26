# Solution Landscape: hourly skill candidate sweep

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic ai skill | quality-gated candidate sweep | lane metrics + deterministic recovery | degraded causes remain in some lanes | top keep: —; degraded_causes: none |
| web frontend skill | quality-gated candidate sweep | lane metrics + deterministic recovery | degraded causes remain in some lanes | top keep: —; degraded_causes: none |
| web backend skill | quality-gated candidate sweep | lane metrics + deterministic recovery | degraded causes remain in some lanes | top keep: —; degraded_causes: none |
| cli open source skill | quality-gated candidate sweep | lane metrics + deterministic recovery | degraded causes remain in some lanes | top keep: —; degraded_causes: none |
| game development skill | quality-gated candidate sweep | lane metrics + deterministic recovery | degraded causes remain in some lanes | top keep: —; degraded_causes: none |

## Categories
- Category A: high-signal maintained repositories that pass license/freshness/signal/fit gate.
- Category B: discovery-only candidates preserved as evidence but excluded from recommendation keeps.

## What People Actually Use
Maintainers consistently rely on GitHub-native search plus metadata fallback checks, then keep only recommendation-grade repos that survive strict gate criteria.

## Frequency Ranking
1. CLI and backend lanes produce the highest volume of recommendation-grade keeps in this run.
2. Agentic/frontend/game lanes remain mixed due to low-fit and stale/no-license noise.

## Key Gaps
- Cross-lane coverage can still be uneven even when total keep count is non-zero.
- Degraded lanes need explicit concentration framing to avoid false confidence.

## Contradictions
- Broad keyword sweeps improve recall but can dilute precision; strict gates protect quality but increase degraded lane frequency.

## Key Insight
A low-risk improvement is to codify a deterministic concentration response: when recommendation-grade keeps are concentrated in <2 lanes, force explicit degraded-lane escalation guidance in the hourly summary template.

## Curated Sources

