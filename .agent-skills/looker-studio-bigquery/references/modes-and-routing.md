# Looker Studio + BigQuery modes and routing

## Core boundary
Use `looker-studio-bigquery` when the real job is **BigQuery-backed dashboard/reporting build-out for stakeholders**.

Keep the lane split four ways:
- `looker-studio-bigquery` — dashboard structure, refresh strategy, audience routing, and stakeholder delivery on top of curated BigQuery data
- `data-analysis` — reasoning from exports, experiments, KPI drops, funnel data, or telemetry evidence
- `pattern-detection` — repeatable anomaly/rule hunting across metrics or events
- `monitoring-observability` — telemetry reliability, instrumentation coverage, alerts, and freshness/observability design

## Primary modes

### 1. Dashboard-build
Use when the user needs a new KPI board, funnel dashboard, PM/ops review dashboard, marketing report, or live-ops dashboard.

### 2. Performance-hardening
Use when the dashboard is slow, expensive, or brittle and the likely fix is a thinner presentation layer over better-shaped BigQuery data.

### 3. Refresh-cost
Use when the main decision is live query vs scheduled-query table vs materialized view vs BI Engine acceleration vs export handoff.

### 4. Audience-routing
Use when one report is trying to satisfy incompatible stakeholders and should be split by audience or decision ritual.

### 5. Migration-review
Use when the user is really asking whether Looker Studio should remain the reporting surface at all.

## Fast routing checklist
- **Stays here:** dashboard structure, KPI scorecards, filter logic, page layout, refresh plan, dashboard packet, stakeholder handoff
- **Move to `data-analysis`:** KPI explanation, experiment interpretation, export analysis, cohort/funnel reasoning
- **Move to `pattern-detection`:** repeated anomaly scans, rule-based metric hunting, reusable suspicious-pattern checks
- **Move to `monitoring-observability`:** alerting, telemetry completeness, instrumentation, service or pipeline visibility
- **Move to `survey`:** platform comparison, governed semantic BI choice, or whether Looker Studio is still the right surface

## Anti-patterns
- Treating Looker Studio as the place to solve raw warehouse modeling problems
- Solving every performance complaint with more charts instead of better table/view design
- Keeping one giant report for executives, analysts, marketers, and operators when the workflows clearly diverge
- Forcing dashboard work when the user really needs a data explanation or platform-choice survey
