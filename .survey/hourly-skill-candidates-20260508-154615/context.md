# Context: Hourly skill candidate loop

## Workflow Context
Survey-first discovery across five required keyword lanes, then artifact generation, validation, PR gating, and blocker reporting when checks are missing. provenance: indexed snippet

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Reviews survey artifacts and merges PRs | Intermediate |
| Automation runner | Generates hourly evidence and blocker reports | Advanced |

## Current Workarounds
1. Continue committing artifacts to existing open PR branch when open-PR gate blocks new PR creation. provenance: direct page retrieval
2. Post deterministic checks-blocker comment instead of merging without CI. provenance: direct page retrieval

## Adjacent Problems
- Lane drift can promote low-fit repos without token-overlap and freshness guards. provenance: indexed snippet
- Inconsistent run summaries reduce reviewer confidence. provenance: thin evidence

## User Voices
- "agentic ai skill: raw=30, kept=5, median_stars=0.0" — indexed snippet
- "web frontend skill: raw=5, kept=0, median_stars=0" — indexed snippet
- "web backend skill: raw=0, kept=0, median_stars=0" — indexed snippet
- "cli open source skill: raw=0, kept=0, median_stars=0" — indexed snippet
- "game development skill: raw=30, kept=1, median_stars=0.0" — indexed snippet
