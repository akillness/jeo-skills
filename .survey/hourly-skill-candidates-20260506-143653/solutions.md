# Solution Landscape: oh-my-skills hourly survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill lane gate | token overlap + freshness/license/signal filters | lowers false-positive promotion | may degrade on sparse lanes | provenance: indexed snippet |
| web-frontend-skill lane gate | token overlap + freshness/license/signal filters | lowers false-positive promotion | may degrade on sparse lanes | provenance: indexed snippet |
| web-backend-skill lane gate | token overlap + freshness/license/signal filters | lowers false-positive promotion | may degrade on sparse lanes | provenance: indexed snippet |
| cli-open-source-skill lane gate | token overlap + freshness/license/signal filters | lowers false-positive promotion | may degrade on sparse lanes | provenance: indexed snippet |
| game-development-skill lane gate | token overlap + freshness/license/signal filters | lowers false-positive promotion | may degrade on sparse lanes | provenance: indexed snippet |

## Categories
- Discovery: base + recovery query stages (feed recovery).
- Promotion: metadata + intent + negation-aware filter.

## What People Actually Use
Maintainers rely on GitHub search metadata and strict validator headings for deterministic hourly artifacts.

## Frequency Ranking
1. Metadata-gated promotion
2. Recovery queries for empty lanes
3. Manual low-fit triage

## Key Gaps
- Some lanes can still return zero results after recovery.
- No-check CI state blocks merge finalization.

## Contradictions
- Broad recall search improves coverage but increases low-fit noise.

## Key Insight
Recommendation quality improves when lane-intent overlap and age-based freshness are both mandatory before promotion.
