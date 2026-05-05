# Context: hourly-skill-candidates

## Workflow Context
This run uses 5 mandatory lanes with staged recovery queries and metadata gates (provenance: indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review/merge hourly PR | Intermediate |
| Automation operator | Monitor CI/check health | Intermediate |

## Current Workarounds
1. Manual triage from raw GH search output.
2. Ad-hoc filtering by stars only.

## Adjacent Problems
- Lane concentration can hide weak category coverage.
- No-results lanes need deterministic degraded causes.

## User Voices
- "Need evidence links and reproducible gates" — automation policy
- "Do not merge without green checks" — quality policy
