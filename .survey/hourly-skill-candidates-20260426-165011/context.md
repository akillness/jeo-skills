# Context

## Workflow Context
- Hourly cron loop to discover and merge low-risk skill improvements via PR.
- Survey artifacts must pass validator contract before implementation.

## Affected Users
- oh-my-skills maintainers and downstream agents relying on survey references.

## Current Workarounds
- Operators manually rewrite `pushed:` cutoff dates in ad-hoc query strings.

## Adjacent Problems
- Static cutoffs can mask freshness regressions while lane status still appears healthy.
- Divergence between narrative policy (rolling 24 months) and concrete query templates.

## User Voices
- Prior hourly wiki notes emphasize deterministic, low-noise lane quality and freshness ratchets.

## Provenance
- direct page retrieval
- indexed snippet
