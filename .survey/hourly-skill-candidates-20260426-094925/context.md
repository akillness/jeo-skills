# Context: hourly-skill-candidate-sweep

## Workflow Context
This run executed five mandatory keyword lanes and applied relevance/freshness/signal gates before promotion. Discovery evidence used indexed snippet provenance via GitHub search output, then direct page retrieval metadata checks where needed.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | merge-safe skill curation | advanced |
| Automation operator | hourly cron stability | advanced |
| Contributor | follow recommendation evidence | intermediate |

## Current Workarounds
1. Manual spot checks of random repositories after keyword search.
2. Ad-hoc filtering without stable lane-level metrics.
3. Post-hoc PR fixes when degraded lanes are discovered late.

## Adjacent Problems
- Lane quality drift when one keyword family becomes noisy.
- Inconsistent degraded cause reporting across runs.
- Concentration risk when recommendations come from too few lanes.

## User Voices
- "Broad keyword hits are useful for recall, but promotion must be recommendation-grade." — indexed snippet
- "Lane metrics should explain why degraded status happened, not just fail/pass." — direct page retrieval
