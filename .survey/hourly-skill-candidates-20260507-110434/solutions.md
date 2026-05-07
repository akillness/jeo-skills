# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| sysdig/skills | agentic ai skill keyword fit | stars=8, license=UNKNOWN | metadata-only triage may miss deep docs | https://github.com/sysdig/skills (provenance: indexed snippet) |
| rhysmcneill/agentic-ai-library | agentic ai skill keyword fit | stars=3, license=apache-2.0 | metadata-only triage may miss deep docs | https://github.com/rhysmcneill/agentic-ai-library (provenance: indexed snippet) |

## Categories
- Discovery: broad keyword sweep + recovery query
- Filtering: intent overlap, negation guard, personal-repo exclusion
- Quality: freshness (<=24 months), signal floor, license metadata

## What People Actually Use
Maintainers rely on `gh search repos` metadata-first filtering, then audit links from evidence artifact (provenance: direct page retrieval).

## Frequency Ranking
1. metadata triage (every run)
2. recovery query for empty lanes (intermittent)
3. manual deep-read before major promotion (as needed)

## Key Gaps
- CI checks absent on many hourly PRs can block merge even with high-quality artifacts.
- Some lanes still degrade to low-fit despite recovery.

## Contradictions
- High-star repositories may still be lane-misaligned after token-overlap checks.

## Key Insight
Strict lane-health metrics plus explicit degraded causes improve reviewer trust and reduce accidental low-fit promotions.
