# Solution Landscape: monitoring-observability structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Google SRE monitoring guidance | Principle-first monitoring + paging philosophy | Clear dashboard / alert / black-box vocabulary; strong symptoms-vs-causes framing | Not a direct implementation packet for every workflow | Best source for actionability and low-noise alert rules |
| OpenTelemetry observability primer | Telemetry model across metrics, logs, and traces | Vendor-neutral observability baseline and shared vocabulary | Broad conceptual layer; not enough by itself for ownership or dashboard quality | Useful for telemetry-foundation mode |
| Prometheus + Alertmanager | Metrics-first monitoring and alerting stack | Strong operational best-practice docs for symptom-first alerting and metamonitoring | Can tempt teams into implementation-before-classification behavior | Strong anchor for service and batch alert rules |
| Grafana dashboard practice | Dashboard design and observability strategy guidance | Strong “dashboard should answer a question” framing; RED / USE / golden-signals routing | Dashboard-heavy if taken alone | Best support for review / gap-audit packet design |
| Vendor APM / telemetry suites (Datadog, New Relic, Honeycomb, etc.) | Hosted traces/metrics/logs + dashboards + alerts | Rich implementation layer once workflow is clear | Product-specific details can drown out route-outs and ownership design | Better as downstream tooling choices than front-door skill shape |
| Data observability vendors / platform checks | Freshness, schema, volume, lineage monitoring | Makes pipeline trust and stale-dashboard failure modes explicit | Often separate from app/service monitoring stacks | Relevant to data / marketing pipeline mode |
| Crash / release visibility tooling | Crash grouping, build/version context, session visibility | Fits game/live-ops and release-risk monitoring well | Easy to confuse with frame-time profiling or general debugging | Best treated as a route-specific packet, not the whole observability skill |

## Categories
- Principle-first monitoring / alerting guidance
- Telemetry foundation and shared instrumentation vocabulary
- Metrics-first monitoring stacks
- Dashboard design / audit guidance
- Hosted APM and observability suites
- Data / pipeline observability layers
- Crash and live-ops visibility tooling

## What People Actually Use
In practice, teams mix one principles layer, one telemetry/metric stack, and one or more downstream surfaces for dashboards, alerts, traces, or crash visibility. They still need a human or agent to decide whether the current packet is a service-health question, telemetry-rollout problem, stale-dashboard trust issue, data-freshness failure, or live-ops visibility gap before any product-specific recommendation becomes useful.

## Frequency Ranking
1. Principle-first alerting + dashboard heuristics (`Google SRE`, `Prometheus`, `Grafana`)
2. Telemetry foundation vocabulary (`OpenTelemetry`)
3. Hosted APM / observability suites for implementation
4. Data / pipeline observability checks for freshness / schema / lineage
5. Crash / live-ops visibility layers for game and release contexts

## Key Gaps
- Existing solutions are strong on implementation detail but weaker on classifying the incoming packet before tool choice.
- Dashboard guidance and alerting guidance often live separately even though review/audit work needs both at once.
- Compact discovery surfaces can lag behind the canonical skill and quietly reintroduce legacy trigger behavior.
- Observability still drifts into debugging, performance tuning, rollout execution, analytics, or engine profiling unless the front door routes aggressively.

## Contradictions
- Vendors promise end-to-end observability, but the docs still emphasize low-noise symptom alerting, explicit dashboard questions, and ownership clarity before dashboards or alerts are useful.
- Teams often talk about “monitoring” as if dashboards, logs, traces, and paging are one task, but source guidance keeps splitting them into different evidence surfaces and action thresholds.
- A rich support bundle exists in the repo already, yet the most discoverable compact surfaces still describe the old generic monitoring setup behavior.

## Key Insight
The best bounded improvement is not another observability, alerting, or dashboard wrapper. It is shrinking `monitoring-observability` into a routing-first front door that starts from the packet and action threshold teams actually have now, moves mode and packet nuance into support references, expands eval coverage around review/audit and route-out pressure, and synchronizes compact/discovery surfaces so the repo stops advertising the pre-modernization skill.

## Curated Sources
- Google SRE — Monitoring Distributed Systems: https://sre.google/sre-book/monitoring-distributed-systems/ (browser-rendered primary page evidence / direct page retrieval)
- OpenTelemetry — Observability primer: https://opentelemetry.io/docs/concepts/observability-primer/ (direct page retrieval via terminal fallback)
- Prometheus — Alerting: https://prometheus.io/docs/practices/alerting/ (browser-rendered primary page evidence)
- Grafana — Dashboard best practices: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/ (browser-rendered primary page evidence)
- Repo-local graph report: `graphify-out/GRAPH_REPORT.md` (graphify-style structural graph evidence)
- Repo-local prior decision record: `.agent-skills-wiki/queries/monitoring-observability-modernization-2026-04-14.md` (wiki query evidence)
