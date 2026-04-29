## Workflow Context
- Hourly cron run for repo-maintenance survey over five mandatory keyword families.
- Discovery source: GitHub search result listings (indexed snippet) followed by repository detail metadata checks (direct page retrieval).

## Affected Users
- Maintainers who merge automated PRs and depend on deterministic quality gates.
- Contributors relying on stable survey artifacts under `.survey/hourly-skill-candidates-20260426-140150/`.

## Current Workarounds
- Manual ad-hoc filtering when lane quality is uneven.
- Post-hoc PR review comments to block weak candidates.

## Adjacent Problems
- Branch collisions in unattended loops.
- Tooling drift (Graphify query schema mismatch) creating artifact inconsistency.

## User Voices
- Need explicit lane_status(pass|degraded) and degraded_causes taxonomy each run.
- Need recommendation-grade keep list backed by license/freshness/signal checks.

Provenance: indexed snippet + direct page retrieval.