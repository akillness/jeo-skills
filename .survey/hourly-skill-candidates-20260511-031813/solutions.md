## Solution List
1. Preserve recall-wide discovery in evidence, then promote only recommendation-grade entries with signal/freshness/fit gates.
2. Emit deduplicated recommendations for reviewer-facing clarity.
3. Add reusable validator for hourly evidence lane-key and recovery-stage contract.

## Categories
- Discovery quality
- Contract validation
- CI-blocker resilience

## What People Actually Use
GitHub search metadata (fullName, description, license, stars, pushedAt) plus deterministic markdown/JSON artifacts.

## Frequency Ranking
1) agentic-ai-skill
2) web-frontend-skill
3) web-backend-skill
4) cli-open-source-skill
5) game-development-skill

## Key Gaps
- Existing repo lacked a dedicated hourly evidence contract validator script.
- CI checks currently unreported for active PR branch.

## Contradictions
Need to keep survey-first breadth while preventing low-fit/personal-demo repos from recommendation output.

## Key Insight
A lightweight evidence-contract validator plus lane-level recovery logging gives deterministic auditability with low operational risk.

Provenance: indexed snippet
