# Source Boundaries for `log-analysis`

## `log-analysis` owns
- Read-only triage of raw logs or excerpts
- Identifying the first actionable failure
- Grouping repeated signatures
- Correlating browser/network/app or container/CI evidence
- Recommending next read-only checks

## Route to `debugging`
Use `debugging` when the likely cause is already narrowed to code behavior and the next job is reproduction, fix design, or verification.

Examples:
- A specific function or module is now the suspect
- The main question is how to reproduce or fix the bug
- The user needs regression tests or code-level debugging steps

## Route to `monitoring-observability`
Use `monitoring-observability` when the request is about instrumentation, log collection, dashboards, retention, alerting, or platform setup.

Examples:
- Add structured logging or correlation IDs
- Set up Prometheus/Grafana/ELK/Datadog
- Design alert rules or ingestion pipelines
- Improve retention/indexing/queryability

## Route to `pattern-detection`
Use `pattern-detection` when the main job is repeated anomaly or rule hunting across many log windows, event families, or telemetry records rather than isolating one first actionable blocker.

Examples:
- Compare repeated error signatures across many releases or cohorts
- Hunt for suspicious retry or abuse patterns over time
- Build a reusable rule pack for recurring event shapes
- Separate broad anomaly detection from one concrete incident

## Route to `game-build-log-triage`
Use `game-build-log-triage` for Unity or Unreal engine-specific editor, package, player, cook, compile, shader, or asset pipeline logs.

Examples:
- `Editor.log`
- `BuildCookRun`
- `UHT` / `UBT`
- Unity package/import/asmdef failures
- Unreal plugin/module/cook failures

## Practical rule
If the user mainly needs to know **which lines matter**, stay in `log-analysis`.
If the user mainly needs to know **how to fix code**, move to `debugging`.
If the user mainly needs to know **how to build the logging/monitoring system**, move to `monitoring-observability`.
If the user mainly needs **engine-specific build/editor/runtime log triage**, move to `game-build-log-triage`.
