## Workflow Context
- Hourly survey/PR loop for `akillness/oh-my-skills`.
- Open hourly PR backlog >= 10 triggered carry-forward preflight.

## Affected Users
- Maintainers relying on unattended hourly skill improvement and auto-merge flow.

## Current Workarounds
- Fallback from `web_search` to `gh api search/repositories`.
- Replacement PR from `main` when selected carry-forward PR is `DIRTY`.

## Adjacent Problems
- Transport outages reduce candidate freshness.
- Mergeability drift in old carry-forward PRs increases operational churn.

## User Voices
- Requirement emphasizes: survey-first evidence collection, RTK summary, Graphify, Obsidian, LLM-Wiki, and merge only after quality gates.

Provenance: indexed snippet, direct page retrieval.
