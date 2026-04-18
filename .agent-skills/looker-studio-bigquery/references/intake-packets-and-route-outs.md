# Intake packets and route-outs

Use this reference after `looker-studio-bigquery` has identified the primary packet.

## 1. `dashboard-spec`
Use when the main job is building or redesigning a stakeholder dashboard on curated BigQuery data.

Capture:
- review ritual and audience
- page or section structure
- KPI scorecards and exact metric definitions
- chart-to-question mapping
- filters, drilldowns, and export needs
- source table/view, grain, owner, and freshness

Default shape:
1. top-line scorecards
2. one main trend or comparison section
3. one segmented drilldown surface
4. one detail table or export surface
5. caveats / freshness / owner notes

## 2. `slow-dashboard`
Use when the dashboard is slow, expensive, or fragile.

Check in this order:
1. raw fact tables vs curated reporting marts/views
2. late joins or heavy report-level calculated fields
3. scheduled query or materialized-view opportunities
4. whether the audience truly needs live freshness
5. BI Engine or caching as an accelerator after upstream shape is fixed

Do not treat chart cosmetics as the answer to a warehouse-shape problem.

## 3. `refresh-shape`
Use when the real question is live vs scheduled vs snapshot.

Compare:
- direct query against curated table/view
- scheduled-query output table
- materialized view
- BI Engine acceleration
- export / Connected Sheets handoff for the last mile

Default bias:
- hourly or daily stakeholder reporting usually prefers precomputed tables
- keep near-real-time only when the ritual truly needs it

## 4. `audience-split`
Use when one dashboard is trying to serve incompatible readers.

Typical split:
- **executive / leadership** → fewer charts, more stability, clear freshness/trust labels
- **PM / analyst / ops** → more filters, more detail, more drilldowns
- **marketing / growth** → pacing, channel, target, and export-handoff surfaces
- **game / live-ops** → event, cohort, regional, and time-window slices with explicit caveats

If the dashboard keeps accumulating exceptions, split by audience rather than forcing one artifact to do everything.

## 5. `exec-handoff`
Use when the dashboard is only part of the workflow and the real deliverable includes Sheets, slides, or export-ready commentary.

Capture:
- which numbers still need annotations, targets, or approvals
- whether Connected Sheets is enough or a slide/deck handoff is cleaner
- how freshness, owner, and caveats stay attached after export
- which tables or views back the exported artifact

The goal is a thin dashboard plus a clean handoff, not an overloaded mega-report.

## Route-outs
- **KPI explanation / dataset reasoning** → `data-analysis`
- **Repeated anomaly or rule hunting** → `pattern-detection`
- **Telemetry reliability / alerting / instrumentation coverage** → `monitoring-observability`
- **BI-platform or semantic-layer choice** → `survey`

## Reusable questions
- What decision will this dashboard change next week?
- Which table/view is the source of truth?
- What would break trust fastest: stale data, inconsistent metric definitions, or audience overload?
- What should stay in BigQuery instead of report-level formulas?
- Does the last mile need interaction, export, or commentary?
