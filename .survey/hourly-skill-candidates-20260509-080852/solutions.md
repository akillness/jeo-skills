# Solution Landscape: hourly skill candidate survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| gh search repos | indexed snippet lane sweep | fast lane coverage | noisy hits require filtering | mandatory in hourly run |
| contract validator | strict evidence key and recovery gate | deterministic auditability | requires schema discipline | direct page retrieval |

## Categories
- discovery
- gating
- validator hardening

## What People Actually Use
Maintainers use GitHub-native search and repository metadata enrichment to keep evidence deterministic under degraded web-search conditions.

## Frequency Ranking
1. gh search repos
2. validator scripts
3. markdown contract checks

## Key Gaps
- recovery query logging drift risk
- lane-key mismatch risk

## Contradictions
- broad recall increases noise; recommendation-grade filters reduce promoted count

## Key Insight
A strict lane-key and two-stage recovery contract reduces audit ambiguity while preserving discovery breadth.

Provenance: indexed snippet, direct page retrieval
