## Settings
- Hourly cron mode with deterministic run slug and branch timestamp.
- Recommendation-grade filter: license/freshness/signal gate.

## Rules
- Execute five required keyword families every run.
- Emit lane_status and degraded_causes with lane metrics.

## Hooks
- Build evidence artifacts before repository code changes.
- Run validator and diff checks before PR/merge.

## Platform Gaps
- GitHub search metadata can return empty-object license payloads.
- Graphify query may fail without generated graph.json and needs fallback graph artifact.

Provenance: indexed snippet, direct page retrieval.
