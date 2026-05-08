# Context: oh-my-skills hourly survey

## Workflow Context
This run follows the open-PR hard gate and updates artifacts on existing PR branch. Survey was executed across all mandatory lanes with staged recovery queries (provenance: indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review and merge hourly PRs | Advanced |
| Contributor | Reuse survey outputs to add skills/references | Intermediate |

## Current Workarounds
1. Manual lane-by-lane GitHub searches and ad-hoc filtering.
2. Manual blocker comments when no checks are configured.

## Adjacent Problems
- License payload shape drift can degrade candidate quality.
- Lane intent false positives from generic demo/homework repositories.

## User Voices
- "Keep survey-first, but do not ship maintenance-only PRs." — run policy
