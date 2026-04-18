# Context: looker-studio-bigquery structural hardening

## Workflow Context
`looker-studio-bigquery` sits at a recurring warehouse-to-dashboard handoff: PM/ops KPI reviews, marketing/GTM performance boards, product funnel summaries, and game/business telemetry dashboards all want a stakeholder-facing artifact on top of curated BigQuery data, not another generic analytics essay. Prior modernization already established the durable lane boundary — thin Looker Studio, heavy logic in BigQuery — but the skill still reads like a long front door instead of a smaller packet router ([.agent-skills/looker-studio-bigquery/SKILL.md](../../.agent-skills/looker-studio-bigquery/SKILL.md), [.agent-skills-wiki/queries/looker-studio-bigquery-modernization-2026-04-15.md](../../.agent-skills-wiki/queries/looker-studio-bigquery-modernization-2026-04-15.md), [graphify-out/GRAPH_REPORT.md](../../graphify-out/GRAPH_REPORT.md)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| PM / ops lead | Weekly KPI review boards, readiness dashboards, stakeholder summaries | Low-SQL to medium |
| Marketing / GTM analyst | Channel pacing, funnel, revenue, and campaign reporting | Medium |
| Analytics engineer | Curated marts, refresh patterns, dashboard trust and ownership | Medium to high |
| Game producer / live-ops analyst | Revenue, retention, regional, and event telemetry review | Medium |
| Exec-report owner | Simple, trustworthy scorecards with clear freshness and owner notes | Medium |

## Current Workarounds
1. Push joins, metric logic, and refresh shaping into BigQuery first, then keep Looker Studio thin ([.survey/looker-studio-bigquery-modernization-20260415/context.md](../looker-studio-bigquery-modernization-20260415/context.md)).
2. Split one giant dashboard by audience when leadership, PMs, marketers, and operators need different levels of detail ([.survey/looker-studio-bigquery-modernization-20260415/solutions.md](../looker-studio-bigquery-modernization-20260415/solutions.md)).
3. Export the last mile to Connected Sheets, slides, or review docs when commentary and approvals matter more than live widgets ([.survey/looker-studio-bigquery-modernization-20260415/context.md](../looker-studio-bigquery-modernization-20260415/context.md)).
4. Route KPI interpretation to `data-analysis`, repeated anomaly hunting to `pattern-detection`, and telemetry/alerting work to `monitoring-observability` instead of stuffing every reporting question into one skill ([.agent-skills-wiki/queries/looker-studio-bigquery-modernization-2026-04-15.md](../../.agent-skills-wiki/queries/looker-studio-bigquery-modernization-2026-04-15.md)).

## Adjacent Problems
- Stakeholder dashboards become slow or expensive when raw fact tables stay too close to the presentation layer.
- Metric trust erodes when SQL logic, calculated fields, and slide/spreadsheet edits all mutate the same KPI story.
- One dashboard often tries to serve incompatible readers (exec, PM/ops, marketing, game/live-ops) and ends up pleasing none of them.
- The repo already has neighboring skills for analysis, anomaly hunting, and observability, so the remaining problem is front-door compression and route-out clarity, not missing concept coverage.

## User Voices
- Repo-local survey evidence keeps converging on the same operator pattern: **do the hard stuff in BigQuery, keep Looker Studio thin** ([.survey/looker-studio-bigquery-modernization-20260415/context.md](../looker-studio-bigquery-modernization-20260415/context.md)).
- The graph report still flags `looker-studio-bigquery` on the oversized watchlist even after the modernization pass, which means the lane is stable but the front door is still denser than neighboring packet-first skills ([graphify-out/GRAPH_REPORT.md](../../graphify-out/GRAPH_REPORT.md)).
- Surrounding skills already follow the newer pattern: smaller front door, one intake packet, explicit route-outs, synced compact discovery, and support-owned detail. `looker-studio-bigquery` is one of the best remaining stable candidates for the same ratchet ([README.md](../../README.md), [setup-all-skills-prompt.md](../../setup-all-skills-prompt.md)).
