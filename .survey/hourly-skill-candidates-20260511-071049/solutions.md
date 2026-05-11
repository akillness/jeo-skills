# Solution Landscape: oh-my-skills hourly survey hourly-skill-candidates-20260511-071049

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Existing hourly evidence builder | Multi-lane search + hard gates | Deterministic lane schema | Markdown scaffolding previously ad-hoc | provenance: indexed snippet |
| New scaffold_hourly_markdown.py | Generate required markdown headings from evidence.json | Reduces heading drift and cron failures | Needs future template extension | provenance: direct page retrieval |

## Categories
- Evidence generation
- Artifact validation
- Cron-safe documentation scaffolding

## What People Actually Use
- GitHub search via gh CLI for repo metadata lanes. (provenance: direct page retrieval)
- In-repo validators for heading/provenance contracts. (provenance: indexed snippet)

## Frequency Ranking
1. agentic-ai-skill: raw=30, kept=5, status=pass
2. web-frontend-skill: raw=5, kept=0, status=degraded
3. web-backend-skill: raw=1, kept=0, status=degraded
4. cli-open-source-skill: raw=1, kept=1, status=pass
5. game-development-skill: raw=30, kept=1, status=pass

## Key Gaps
- Some lanes remain degraded; additional recovery variants are still needed for broader recommendation coverage. (provenance: thin evidence)

## Contradictions
- High raw discovery counts do not guarantee recommendation-grade fit after intent and signal filters. (provenance: indexed snippet)

## Key Insight
Automating markdown scaffolding from validated evidence creates functional value every run and reduces contract-drift risk under unattended cron execution. (provenance: direct page retrieval)
