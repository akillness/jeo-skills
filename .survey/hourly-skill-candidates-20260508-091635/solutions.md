# Solution Landscape: hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | metadata-gated promotion | lane metrics and fit guards | can under-select in sparse lanes | top: AbdelhakRazi/flutter-bloc-clean-architecture-skill |
| web-frontend-skill | metadata-gated promotion | lane metrics and fit guards | can under-select in sparse lanes | top: none |
| web-backend-skill | metadata-gated promotion | lane metrics and fit guards | can under-select in sparse lanes | top: none |
| cli-open-source-skill | metadata-gated promotion | lane metrics and fit guards | can under-select in sparse lanes | top: nexu-io/open-design |
| game-development-skill | metadata-gated promotion | lane metrics and fit guards | can under-select in sparse lanes | top: tjboudreaux/cc-plugin-unity-gamedev |

## Categories
- Discovery reliability
- Promotion quality gates
- Development-focused automation assets

## What People Actually Use
Maintainers rely on GitHub search and metadata gates in cron-first workflows (provenance: indexed snippet).

## Frequency Ranking
1. Metadata-gated candidate triage
2. Recovery query retries
3. Lane health metrics review

## Key Gaps
- Need reusable utility to normalize and score lane candidates consistently.

## Contradictions
- Broad recall improves discovery, but strict fit/signal gates reduce promotion count.

## Key Insight
A reusable scorer utility yields repeatable, auditable promotion decisions and enables development-focused improvements each run.
