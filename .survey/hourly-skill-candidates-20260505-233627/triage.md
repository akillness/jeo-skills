# Triage
- Problem: Hourly survey quality drift and inconsistent lane coverage in repo-maintenance discovery.
- Audience: Maintainers of akillness/oh-my-skills.
- Why now: New hourly run detected lane variance; quality gates require deterministic provenance labels (indexed snippet/feed recovery).

## Workflow Context
- Provenance labels used: indexed snippet, feed recovery.
- Source: GitHub search API results with links in evidence.json.

## Affected Users
- Skill maintainers relying on stable survey-to-PR automation.

## Current Workarounds
- Manual query retries and ad-hoc lane filtering.

## Adjacent Problems
- License payload shape drift and stale-project inclusion risk.

## User Voices
- "Need merge-ready artifacts every hour without proposal-only dead ends." (cron policy)
