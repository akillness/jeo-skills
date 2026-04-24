## Workflow Context
The run executes five mandatory keyword lanes and applies metadata + freshness gates before any recommendation.

## Affected Users
- Repository maintainers merging hourly PRs.
- Downstream users consuming skill docs and references.

## Current Workarounds
- Manual curation after broad keyword search.
- Ad-hoc recovery queries when a lane is sparse/noisy.

## Adjacent Problems
- Query noise can over-represent irrelevant repos.
- Inconsistent recovery behavior across lanes causes unstable results.

## User Voices
- Need deterministic hourly loop with evidence links and merge-ready validation.
- Prefer non-destructive low-risk improvements over broad rewrites.

Provenance labels used: direct page retrieval.
