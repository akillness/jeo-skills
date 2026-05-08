# Context: oh-my-skills hourly survey

## Workflow Context
Hourly cron run executes five mandatory keyword lanes, applies quality gates, and updates an existing PR branch when open-PR gate is active. Provenance: indexed snippet.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review/merge survey hardening updates | Intermediate |
| Automation operator | Keep hourly loop green and deterministic | Intermediate |

## Current Workarounds
1. Carry-forward commits to existing open PR when no checks are reported.
2. Post deterministic blocker comment instead of merging.

## Adjacent Problems
- Missing CI checks configuration blocks safe merge.
- Lane quality can drift toward low-fit repos without deterministic gates.

## User Voices
- "Keep development-focused improvements, not maintenance-only edits." — run policy
- "Do not merge on no checks reported." — run policy
