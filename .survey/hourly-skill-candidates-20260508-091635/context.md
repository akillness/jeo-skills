# Context: oh-my-skills hourly survey

## Workflow Context
Hourly cron run executed under open-PR gate and checks-blocked mode. Discovery across five mandatory lanes used GitHub indexed retrieval only (provenance: indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Merge and release quality control | advanced |
| Automation operator | Keep hourly loop productive | advanced |

## Current Workarounds
1. Manual lane triage when search quality is noisy.
2. Ad hoc filtering for stale/license/low-fit repos.

## Adjacent Problems
- No-checks-reported PRs can accumulate with low confidence.
- Inconsistent lane-level quality metrics across runs.

## User Voices
- "development/progression over maintenance-only" — scheduler policy
- "must include mandatory five lanes each run" — scheduler policy
