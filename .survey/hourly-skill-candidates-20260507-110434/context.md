# Context: oh-my-skills hourly survey automation

## Workflow Context
The run discovers candidates across five mandatory lanes, applies relevance/quality gates, then packages artifacts for PR lifecycle. Evidence came from GitHub repository search and API metadata (provenance: indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Reviews hourly PRs and merges safe updates | advanced |
| Contributor | Uses survey artifacts to implement skill updates | intermediate |

## Current Workarounds
1. Manual lane-by-lane vetting in PR review.
2. Ad-hoc retries when keyword lane returns zero results (provenance: thin evidence).

## Adjacent Problems
- CI checks are often missing on carry-forward branches.
- Candidate quality can cluster in a single lane.

## User Voices
- "no checks reported" repeatedly appears on recent hourly PR branches — gh pr checks output (provenance: direct page retrieval)
