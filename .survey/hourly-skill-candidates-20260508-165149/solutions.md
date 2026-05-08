# Solution Landscape: hourly skill candidate survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic ai skill | staged GH search + gating | auditable metrics | degraded when no strong keeps | provenance: indexed snippet |
| web frontend skill | staged GH search + gating | auditable metrics | degraded when no strong keeps | provenance: indexed snippet |
| web backend skill | staged GH search + gating | auditable metrics | degraded when no strong keeps | provenance: feed recovery |
| cli open source skill | staged GH search + gating | auditable metrics | degraded when no strong keeps | provenance: feed recovery |
| game development skill | staged GH search + gating | auditable metrics | degraded when no strong keeps | provenance: indexed snippet |

## Categories
- Recommendation-grade keeps
- Low-fit/low-signal filtered pool
- Degraded lanes requiring follow-up

## What People Actually Use
Maintainers rely on GitHub search + evidence.json + markdown artifacts for deterministic review.

## Frequency Ranking
1. GitHub repo search lanes
2. Evidence + lane metrics
3. Blocker comments when checks missing

## Key Gaps
- Some lanes may still degrade to low-fit/no-results despite recovery.
- CI checks are absent on the active PR branch.

## Contradictions
- Broad discovery finds many repos, but strict relevance/quality gates intentionally keep few.

## Key Insight
Signal-floor + intent overlap + freshness gating prevents weak recommendations while preserving raw evidence for audit.

Provenance: indexed snippet and feed recovery.
