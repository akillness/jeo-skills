# Context: oh-my-skills hourly survey maintenance

## Workflow Context
The run executes required keyword-family discovery, then deterministic recovery queries for sparse/noisy lanes, then metadata/signal gating before candidates are promoted.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| agentic-ai-skill | hourly candidate scouting + quality gate | intermediate |
| web-frontend-skill | hourly candidate scouting + quality gate | intermediate |
| web-backend-skill | hourly candidate scouting + quality gate | intermediate |
| cli-open-source-skill | hourly candidate scouting + quality gate | intermediate |
| game-development-skill | hourly candidate scouting + quality gate | intermediate |

## Current Workarounds
1. Manual triage of noisy keyword matches.
2. One-off query rewrites when lanes are empty/noisy.
3. Ad-hoc metadata lookups for license/archival/freshness.

## Adjacent Problems
- Lane-intent mismatch where repositories include "skill" tokens but do not match target capability.
- Missing license metadata in search payloads requiring direct page retrieval.
- Concentration risk when recommendations come from too few lanes.

## User Voices
- "agentic-ai-skill lane status is pass with kept_count=3 and raw_count=40." — indexed snippet
- "web-frontend-skill lane status is degraded with kept_count=0 and raw_count=4." — indexed snippet
- "web-backend-skill lane status is degraded with kept_count=0 and raw_count=0." — indexed snippet
- "cli-open-source-skill lane status is pass with kept_count=1 and raw_count=1." — indexed snippet
- "game-development-skill lane status is pass with kept_count=4 and raw_count=40." — indexed snippet
