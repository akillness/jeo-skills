# Solution Landscape: monitoring-observability modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| OpenTelemetry | Vendor-neutral instrumentation standard for traces / metrics / logs | Strong common language for instrumentation, semantic conventions, and backend portability | Still needs backend, sampling, naming discipline, and practical rollout guidance | Best foundation layer for the skill’s instrumentation mode ([OpenTelemetry primer](https://opentelemetry.io/docs/concepts/observability-primer/)) |
| Prometheus + Alertmanager | OSS metrics collection and alerting | Excellent metrics ecosystem, symptom-first alerting guidance, huge adoption | Not a full answer for traces/log UX, still requires dashboard/log stack choices | Strong fit for service health / SLO / metamonitoring mode ([Prometheus alerting](https://prometheus.io/docs/practices/alerting/)) |
| Grafana | Dashboards / unified visualization / SLO and observability UX | Flexible visualization, common hub across OSS and managed stacks | Can become dashboard sprawl without ownership and question-first design | Strong fit for dashboard-review mode ([Grafana observability article](https://grafana.com/blog/what-is-observability-best-practices-key-metrics-methodologies-and-more/)) |
| Datadog | Managed all-in-one observability platform | Strong product coverage: logs, metrics, traces, SLOs, incidents, workflows | Cost and vendor lock-in are recurring complaints in community snippets | Useful reference for managed-platform patterns; not the only target stack |
| Sentry | Error / crash / release / performance-focused platform | Excellent issue grouping, breadcrumbs, crash context, and game-engine support | Not the best single home for broad infra metrics / data-pipeline lineage | Best fit for crash/error workflow examples, especially game/mobile/web ([Sentry gaming](https://sentry.io/solutions/game-developers/), [breadcrumbs docs](https://docs.sentry.io/product/issues/issue-details/breadcrumbs/)) |
| New Relic | Managed full-stack observability | Broad APM / infra / log coverage | Pricing and scope creep often make it a later-stage choice | Mentioned in indexed community snippets as part of stitched stacks |
| Data-observability vendors (Databricks framing, DataHub, Metaplane, Soda, Monte Carlo) | Pipeline freshness / schema / lineage / anomaly monitoring | Strong for product, BI, marketing, and warehouse reliability | Different problem from basic app/infra observability; easy to ignore in generic skills | Important because the repo also serves PM/ops/marketing workflows |
| AccelByte / game live-ops tooling | Built-in game backend observability and debugging | Matches live-ops / session / compliance / matchmaking workflows | Product-specific; not a general observability foundation | Good evidence that game teams need different examples and handoffs ([AccelByte tools](https://accelbyte.io/tools)) |

## Categories
- **Instrumentation foundation**: OpenTelemetry
- **Metrics + alerts OSS core**: Prometheus, Alertmanager
- **Dashboard / visualization layer**: Grafana
- **Managed full-stack platforms**: Datadog, New Relic, Splunk/Dynatrace class (mentioned in indexed snippets)
- **Crash / issue-centric specialists**: Sentry
- **Data / pipeline observability**: Databricks framing, DataHub, Metaplane, Soda, Monte Carlo class
- **Game live-ops observability**: AccelByte, Sentry gaming surface, engine/platform profilers for adjacent evidence

## What People Actually Use
The evidence consistently points to **stitched stacks**, not one perfect platform. Primary docs say teams need metrics, logs, traces, dashboards, alerts, and post-incident review loops; indexed community snippets say many teams combine OpenTelemetry instrumentation with Prometheus/Grafana and then add Sentry/New Relic/Datadog for issue or APM depth. In other words: instrumentation foundation + metrics/dashboard layer + alerting + one or more specialist surfaces.

## Frequency Ranking
1. OpenTelemetry + Prometheus/Grafana style foundation
2. Managed full-stack platform (Datadog / New Relic / similar)
3. Sentry for crash/error-centric workflows
4. Data-observability tooling for BI / pipeline health
5. Game-specific live-ops / crash tooling

## Curated Sources
- Google SRE: Monitoring Distributed Systems — https://sre.google/sre-book/monitoring-distributed-systems/
- OpenTelemetry observability primer — https://opentelemetry.io/docs/concepts/observability-primer/
- Prometheus alerting best practices — https://prometheus.io/docs/practices/alerting/
- Grafana: What is observability? — https://grafana.com/blog/what-is-observability-best-practices-key-metrics-methodologies-and-more/
- Databricks: What is Data Observability? — https://www.databricks.com/blog/what-is-data-observability
- AccelByte tools and utilities — https://accelbyte.io/tools
- Sentry for game developers — https://sentry.io/solutions/game-developers/
- Sentry breadcrumbs docs — https://docs.sentry.io/product/issues/issue-details/breadcrumbs/
- Yahoo browser-rendered indexed snippets for Reddit observability workflow queries — recovered during this run

## Key Gaps
- The current repo skill does not separate **instrumentation foundation**, **alert design**, **dashboard / service review**, **data-observability**, and **game/live-ops** modes.
- It lacks support artifacts that make observability reviews repeatable: alert-quality checklist, telemetry rollout matrix, and ownership / handoff boundaries.
- It does not make route-outs explicit enough (`log-analysis`, `performance-optimization`, `deployment-automation`, `langsmith`, `game-performance-profiler`).
- It over-indexes on one Node/Prometheus example instead of reusable decision workflows.

## Contradictions
- Marketed observability stacks promise one-pane-of-glass simplicity, but indexed community evidence still shows multi-tool stitching and careful incident-threshold management.
- “Monitoring” examples often stop at dashboards and exporters, while primary docs emphasize symptom-first alerting, metamonitoring, and unknown-unknown troubleshooting.
- Data/marketing pipeline observability is often omitted from generic observability guides even though primary sources treat freshness/schema/lineage as first-class operational concerns.

## Key Insight
The strongest bounded improvement is **not** adding another specialist observability skill. It is rewriting `monitoring-observability` into a **mode-selecting telemetry architecture and review anchor** that starts with the workflow surface (service reliability, telemetry foundation, data/marketing pipeline health, game/live-ops crash visibility, or dashboard/alert review), then routes specialized diagnosis to neighboring skills. That upgrade would sharpen repo boundaries, improve activation quality, and add transferable support files without creating another overlapping infrastructure wrapper.
