# Context: oh-my-skills hourly survey

## Workflow Context
This run executed five mandatory lanes and generated evidence from GitHub indexed search with recovery policy. (provenance: indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review and merge quality-safe updates | Advanced |
| Automation operator | Monitor unattended hourly runs | Intermediate |

## Current Workarounds
1. Manually inspect lane quality when candidate noise is high. (provenance: thin evidence)
2. Keep PR open when no checks are reported. (provenance: direct page retrieval)

## Adjacent Problems
- Schema drift in metadata fields can create false degraded license/staleness decisions.
- Low-fit token overlap can inflate weak recommendations.

## User Voices
- "Survey-first should still land real implementation changes every run." — run policy
- "If checks are missing, never merge automatically." — run policy
