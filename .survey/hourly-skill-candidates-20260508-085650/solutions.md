# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | staged search + quality gates | deterministic recovery evidence | may degrade when ecosystem sparse | kept=5 raw=30 |
| web-frontend-skill | staged search + quality gates | deterministic recovery evidence | may degrade when ecosystem sparse | kept=0 raw=5 |
| web-backend-skill | staged search + quality gates | deterministic recovery evidence | may degrade when ecosystem sparse | kept=0 raw=1 |
| cli-open-source-skill | staged search + quality gates | deterministic recovery evidence | may degrade when ecosystem sparse | kept=1 raw=1 |
| game-development-skill | staged search + quality gates | deterministic recovery evidence | may degrade when ecosystem sparse | kept=1 raw=30 |

## Categories
- Discovery
- Quality gates
- Recommendation filtering

## What People Actually Use
Maintainers rely on GitHub search + validator scripts + markdown artifacts; this run keeps that path explicit (provenance: indexed snippet).

## Frequency Ranking
1. GitHub search lanes
2. Evidence contract validator
3. Artifact validator

## Key Gaps
- CI checks absent on current PR branch blocks merge.
- Some lanes can return sparse high-fit results.

## Contradictions
- Broad discovery improves recall but raises low-fit noise; recommendation gate resolves this tension.

## Key Insight
A reusable query-generation script reduces drift and guarantees stage-1/stage-2 recovery query coverage every run.
