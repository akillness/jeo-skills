# Context: monitoring-observability structural hardening

## Workflow Context
Observability work keeps arriving in four reusable shapes: service-health coverage before launch, telemetry rollout after architecture changes, dashboard/alert audits after trust erodes, and cross-functional reliability work for pipelines or live operations. Google SRE frames monitoring as collecting, aggregating, and displaying real-time quantitative system data, with dashboards answering core service questions and alerts interrupting humans only for actionable issues. Prometheus and Grafana then reinforce the same operational split: alert on symptoms, keep noise low, use dashboards to answer questions, and keep metamonitoring in scope. Inside `oh-my-skills`, the 2026-04-14 modernization already established the right boundary for `monitoring-observability`, but the current front door still carries too much inline mode detail while the compact discovery files still describe the pre-rewrite skill.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainers | Keep the infrastructure cluster coherent and prevent stale discovery surfaces | Advanced |
| Agents using the skill catalog | Route observability asks to the right anchor with low ambiguity | Mixed |
| Platform / SRE / backend teams | Design service telemetry, alerting, SLO questions, and ownership handoffs | Intermediate–advanced |
| Data / ops / marketing teams | Add freshness, schema-drift, volume, and dashboard-trust monitoring to pipelines | Intermediate |
| Game / live-ops teams | Add crash/session/build visibility without turning the task into engine-profiler work | Intermediate |

## Current Workarounds
1. Keep one large observability skill that tries to explain modes, alerts, dashboards, telemetry rollout, and route-outs inline, then rely on readers to infer the real entry packet.
2. Use the current support docs, but still let stale `SKILL.toon` / `skills.toon` text advertise the older "Prometheus/Grafana/log aggregation" framing on compact discovery surfaces.
3. Jump directly to vendor/tool questions even when the real problem is classifying the workflow, evidence packet, and ownership boundary first.
4. Treat dashboards as the whole observability strategy, then separately rediscover alert/noise/metamonitoring rules after incidents.
5. Fall back to manual freshness checks, spreadsheet trust checks, or ad hoc launch-event dashboards when the monitoring brief was never normalized up front.

## Adjacent Problems
- Dense anchors make trigger quality worse even when the canonical boundary is conceptually correct.
- Compact discovery drift can quietly reactivate legacy behavior after the main `SKILL.md` has improved.
- Observability requests often blur into root-cause debugging, performance tuning, rollout execution, or product analytics unless route-outs are aggressively explicit.
- Dashboard sprawl and dead alerts remain structural maintenance problems, not just tooling problems.
- Support coverage is already repo-complete, so the maintenance bottleneck has shifted from missing files to front-door size and discovery-surface truthfulness.

## User Voices
- Google SRE defines a dashboard as a summary view of a service’s core metrics and warns that pages should only interrupt humans for issues serious enough to act on ([https://sre.google/sre-book/monitoring-distributed-systems/](https://sre.google/sre-book/monitoring-distributed-systems/), browser-rendered primary page evidence / direct page retrieval).
- Prometheus summarizes alerting as: “keep alerting simple, alert on symptoms, have good consoles to allow pinpointing causes, and avoid having pages where there is nothing to do” ([https://prometheus.io/docs/practices/alerting/](https://prometheus.io/docs/practices/alerting/), browser-rendered primary page evidence).
- Prometheus further says to “aim to have as few alerts as possible” and to alert on symptoms tied to end-user pain rather than every internal cause ([https://prometheus.io/docs/practices/alerting/](https://prometheus.io/docs/practices/alerting/), browser-rendered primary page evidence).
- Grafana states that “A dashboard should tell a story or answer a question,” and notes that alerting is best done on symptom-oriented RED dashboards ([https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/), browser-rendered primary page evidence).
- The repo’s own graph report now flags `monitoring-observability` on the oversized front-door watchlist while support coverage is already complete, which points to structural hardening instead of another neighboring skill (`graphify-out/GRAPH_REPORT.md`, repo-local graph evidence).
