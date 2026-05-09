# Context: hourly survey maintenance for oh-my-skills

## Workflow Context
This run follows survey-first discovery across five mandatory lanes using GitHub indexed snippet retrieval with documented stage-1 and stage-2 recovery queries.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review and merge quality improvements | Advanced |
| Contributor | Consume references and scripts | Intermediate |

## Current Workarounds
1. Manual lane sanity checks and ad-hoc evidence edits.

## Adjacent Problems
- Missing deterministic evidence-contract validation can allow malformed hourly artifacts.

## User Voices
- "Do not merge when no checks reported; leave blocker and CI bootstrap steps." — run policy (provenance: direct page retrieval)
