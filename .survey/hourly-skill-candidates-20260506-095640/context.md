# Context: Oh-My-Skills hourly survey

## Workflow Context
The cron run discovers repositories from five mandatory keyword lanes, records evidence with links, applies fit/freshness/signal/license gates, and packages artifacts for PR review. Provenance labels are embedded in markdown (provenance: indexed snippet).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Validate survey quality and merge safe improvements | Advanced |
| Automation operator | Run unattended hourly maintenance loop | Advanced |

## Current Workarounds
1. Manual inspection of GitHub search results when lanes are noisy.
2. Carry-forward degraded lanes with explicit causes for reviewer triage.

## Adjacent Problems
- No-checks-reported branches block merge even when artifacts are valid.
- Lane concentration can reduce coverage diversity.

## User Voices
- "agentic-ai-skill: raw=6, kept=1, status=pass" — GitHub repo search (provenance: indexed snippet)
- "web-frontend-skill: raw=1, kept=0, status=degraded" — GitHub repo search (provenance: indexed snippet)
- "web-backend-skill: raw=0, kept=0, status=degraded" — GitHub repo search (provenance: indexed snippet)
- "cli-open-source-skill: raw=0, kept=0, status=degraded" — GitHub repo search (provenance: indexed snippet)
- "game-development-skill: raw=4, kept=0, status=degraded" — GitHub repo search (provenance: indexed snippet)
