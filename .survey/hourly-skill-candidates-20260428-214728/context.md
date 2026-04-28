# Context

## Workflow Context
- Recurring hourly cron run performs survey-based candidate discovery, documentation ratchets, and PR lifecycle completion.
- Current repository shows high open PR backlog in hourly-survey stream.

## Affected Users
- Primary: repository maintainers and autonomous maintenance agents.
- Secondary: reviewers who need reliable lane diagnostics and reproducible artifacts.

## Current Workarounds
- Manual cherry-pick/recreate when carry-forward PR cannot merge.
- Ad-hoc branch rewrites that are risky in unattended environments.

## Adjacent Problems
- Queue saturation reduces signal-to-noise in open PRs.
- Unmergeable PRs block expected carry-forward behavior.

## User Voices
- Operational requirement: avoid destructive rewrites in unattended cron.
- Operational requirement: keep RTK/Graphify/Obsidian/LLM-Wiki continuity every run.

Provenance: indexed snippet, direct page retrieval
