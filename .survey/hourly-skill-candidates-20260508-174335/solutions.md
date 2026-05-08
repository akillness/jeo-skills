# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| hourly lane contract validator | Enforce keys + recovery stages | deterministic auditability | extra script maintenance | best fit |
| ad-hoc review | manual read-through | flexible | non-deterministic | fallback |

## Categories
- Contract validation
- Evidence generation

## What People Actually Use
- GitHub search + scripted JSON curation + markdown artifacts (indexed snippet).

## Frequency Ranking
1. Scripted validation
2. Manual triage

## Key Gaps
- Missing strict evidence-contract check in repo.

## Contradictions
- Need speed in hourly runs vs strict schema correctness.

## Key Insight
Add a lightweight validator script that fails fast on lane-contract drift and impossible metrics.
