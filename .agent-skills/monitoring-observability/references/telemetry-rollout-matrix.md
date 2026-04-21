# Telemetry Rollout Matrix

Use this matrix to choose the first implementation slice.

| Surface | Minimum telemetry | Nice-to-have | Common failure if missing |
|---------|-------------------|--------------|---------------------------|
| Web / API service | request count, error rate, latency distribution, health check, request/trace IDs | dependency spans, deploy markers, saturation/capacity metrics | incidents rely on raw logs only |
| Worker / queue job | run duration, success/failure counts, backlog age, retry count, job IDs | step-level spans, payload class tags, dead-letter visibility | silent backlog growth or invisible retry storms |
| Data / marketing pipeline | freshness age, job status, row counts, schema change detection, lineage owner | distribution/null checks, downstream dashboard dependency map | stale dashboards and broken trust discovered by humans first |
| Game / live-ops backend | session health, crash rate, API latency/errors, build/platform tags, event/region splits | purchase / matchmaking slices, launch-event war-room dashboard, breadcrumbs | players report problems before the team sees them |
| Existing stack review | top dashboards, top alerts, runbook links, ownership map | metamonitoring, dead-alert cleanup, retention review | noisy alerts and blind spots coexist |

## Retention / cardinality notes
- Keep labels bounded; avoid unbounded user IDs in metrics labels.
- Use logs or trace attributes for high-cardinality detail.
- Add correlation IDs consistently before chasing fancy dashboards.
- Sample expensive traces deliberately; do not silently destroy critical incident paths.

## Ownership defaults
- Service reliability: app team + platform/SRE
- Data observability: data/ops owner + dashboard consumer owner
- Game live-ops: live-ops / backend owner + crash tooling owner
- Existing-stack review: whoever gets paged should be part of the ownership decision
