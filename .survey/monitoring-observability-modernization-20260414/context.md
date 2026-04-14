# Context: monitoring-observability modernization

## Workflow Context
Observability work shows up in at least five recurring workflow shapes:

1. **Service reliability / on-call setup** — teams need a minimum signal set, dashboards, and page-worthy alerts before production. Google SRE frames monitoring as collecting and displaying real-time service data, and warns that pages are expensive so alerts should have good signal and very low noise ([Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)). Prometheus best practices make the same point operationally: keep alerting simple, alert on symptoms, and alert as high in the stack as possible ([Prometheus alerting best practices](https://prometheus.io/docs/practices/alerting/)).
2. **Instrumentation / telemetry architecture** — teams need a vendor-neutral way to emit metrics, traces, and logs before they choose any backend. OpenTelemetry’s observability primer explicitly positions instrumentation as the mechanism that emits traces, metrics, and logs so teams can answer unknown-unknown questions without adding more instrumentation mid-incident ([OpenTelemetry observability primer](https://opentelemetry.io/docs/concepts/observability-primer/)).
3. **Data / marketing pipeline reliability** — product, marketing, and BI owners increasingly need observability for stale data, schema drift, volume anomalies, and broken dashboards. Databricks describes data observability as continuous monitoring across pipelines, storage, and downstream analytics, with five pillars: freshness, volume, distribution, schema, and lineage ([Databricks: What is Data Observability?](https://www.databricks.com/blog/what-is-data-observability)). Yahoo indexed snippets for data-observability results repeatedly emphasize pipeline health, freshness, and alerting for BI reliability (`DataHub`, `Databricks`, `Metaplane`) — browser-rendered indexed snippets, medium confidence.
4. **Game / live-ops visibility** — game teams need crash visibility, player-session context, backend API visibility, and live-ops telemetry under load. AccelByte pitches built-in monitoring/debugging utilities for pre-launch testing and live operations, while Sentry’s gaming surface focuses on real-time crash reporting across engine/build/platform variants with breadcrumbs, device context, and alerts ([AccelByte tools](https://accelbyte.io/tools), [Sentry for game developers](https://sentry.io/solutions/game-developers/)).
5. **Incident handoff / ongoing operations** — the skill must stop before root-cause log forensics or code-level debugging. The repo already assigns those jobs to `log-analysis`, `debugging`, `performance-optimization`, and `game-performance-profiler`; `monitoring-observability` should own setup, instrumentation, alert/dashboards, telemetry retention, and review checklists instead of absorbing incident triage.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| App / backend developer | Add instrumentation, health endpoints, and actionable service metrics | Intermediate |
| SRE / platform engineer | Define SLOs, alerts, routing, and metamonitoring for services | Advanced |
| Product / marketing / BI operator | Keep analytics pipelines fresh, trustworthy, and alertable | Intermediate |
| Game backend / live-ops engineer | Track crashes, latency, session health, and launch-event stability | Intermediate to advanced |
| Team lead / incident owner | Make sure telemetry answers “what is breaking?” before an outage escalates | Intermediate |

## Current Workarounds
1. Copy a generic Prometheus/Grafana example and call the job done, even when the real need is alert policy, retention, or ownership review.
2. Mix vendor setup, instrumentation code, dashboard design, and incident response into one skill, which makes routing blurry and activation noisy.
3. For data/marketing workflows, rely on ad-hoc freshness checks, cron alerts, or dashboard eyeballing instead of explicit pipeline-health dimensions (freshness, schema, volume, lineage).
4. For game workflows, split between engine profiler tools, backend dashboards, and crash-reporting products without a reusable handoff brief.
5. Use logs as the only evidence surface, then discover during incidents that the application is missing trace correlation, service-level metrics, or black-box checks.

## Adjacent Problems
- `log-analysis` owns root-cause log triage after telemetry exists.
- `performance-optimization` owns bottleneck diagnosis once measurements show a performance problem.
- `deployment-automation` owns release execution and post-deploy verification, not long-lived telemetry architecture.
- `langsmith` owns LLM-specific tracing/evaluation, not general service or product observability.
- `game-performance-profiler` owns engine/frame-time bottleneck interpretation, not live service telemetry architecture.

## User Voices
- “A lot of teams are stitching together Prometheus, Grafana, OpenTelemetry, and some APM or error tracker like New Relic or Sentry...” — Yahoo indexed snippet for Reddit thread `r/devops` “How are you actually handling observability in 2025?” (browser-rendered indexed snippet, high confidence because URL + snippet were recovered in the same run): https://www.reddit.com/r/devops/comments/1lf9wge/how_are_you_actually_handling_observability_in/
- “We just grafana to visualize AWS metrics and logs and send alerts to ServiceNow. We’re very careful about what incidents we create...” — Yahoo indexed snippet for Reddit thread `r/sre` “How are you actually handling observability in 2025?” (browser-rendered indexed snippet, high confidence): https://www.reddit.com/r/sre/comments/1lf9n5v/how_are_you_actually_handling_observability_in/
- “I’d go with Prometheus and Grafana. Now we use NewRelic and Sentry, but the price is insane.” — Yahoo indexed snippet for Reddit thread `r/devops` “Which observability stack would u choose?” (browser-rendered indexed snippet, high confidence): https://www.reddit.com/r/devops/comments/1ay1rpa/which_observability_stack_would_u_choose/
