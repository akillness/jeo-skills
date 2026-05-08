# Solution Landscape: hourly survey automation

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| build_hourly_evidence.py | Deterministic query lanes + gating | Auditable and repeatable | Needs post-run freshness analytics | provenance: indexed snippet |
| stage recovery metadata | stage-0/1/2 query trace | Deterministic no-result diagnosis | Adds artifact verbosity | provenance: indexed snippet |
| freshness window auditor (new) | Counts stale candidates by lane age window | Catches recency drift early | Depends on pushedAt quality | provenance: direct page retrieval |

## Categories
- Discovery orchestration
- Recommendation quality gates
- Reporting and reviewer ergonomics

## What People Actually Use
- GitHub search metadata and repo API enrichments for license/freshness checks.

## Frequency Ranking
1. indexed snippet
2. direct page retrieval

## Key Gaps
- Need explicit stale-candidate count by lane to make freshness gate drift visible over time.

## Contradictions
- High-star repos can still be low-fit for lane intent despite traction.

## Key Insight
- A compact stale-window audit strengthens development quality without expanding scope to risky automation changes.
