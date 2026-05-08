# Context: oh-my-skills hourly survey

## Workflow Context
This run executed the five mandatory keyword lanes, then applied recovery queries and recommendation-grade filters.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | Curate viable skill candidates | Advanced |
| Automation operator | Review hourly PR health and blockers | Intermediate |

## Current Workarounds
1. Keep appending run artifacts to existing open PR when checks are missing.
2. Use blocker comments with deterministic CI bootstrap steps.

## Adjacent Problems
- Lane outputs can be noisy and overfit token-only matches.
- Missing checks prevents merge even for valid improvements.

## User Voices
- "Development-first change each run; avoid maintenance-only PRs." — scheduler instruction

Provenance labels used: indexed snippet, feed recovery.
