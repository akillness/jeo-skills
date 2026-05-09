# Solution Landscape: hourly skill candidate discovery

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | lane sweep + recovery | raw=42 kept=38 | low-fit/no-results possible | provenance: indexed snippet |
| web-frontend-skill | lane sweep + recovery | raw=1 kept=1 | low-fit/no-results possible | provenance: indexed snippet |
| web-backend-skill | lane sweep + recovery | raw=1 kept=0 | low-fit/no-results possible | provenance: indexed snippet |
| cli-open-source-skill | lane sweep + recovery | raw=3 kept=2 | low-fit/no-results possible | provenance: indexed snippet |
| game-development-skill | lane sweep + recovery | raw=1 kept=0 | low-fit/no-results possible | provenance: indexed snippet |

## Categories
- Discovery
- Validation
- Reporting

## What People Actually Use
GitHub code search and repo metadata are used as primary discovery inputs (provenance: indexed snippet).

## Frequency Ranking
1. agentic-ai-skill
2. web-frontend-skill
3. web-backend-skill
4. cli-open-source-skill
5. game-development-skill

## Key Gaps
- CI checks not configured/reported for active PR branch.

## Contradictions
- Policy requires merge-gated checks, but current PR branch reports no checks.

## Key Insight
Contract validation script plus strict lane recovery logging reduces reviewer ambiguity.
