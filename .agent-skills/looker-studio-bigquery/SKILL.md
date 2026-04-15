---
name: looker-studio-bigquery
description: >
  Build BigQuery-backed Looker Studio dashboards for stakeholder reporting: KPI
  scorecards, funnel and retention boards, marketing / GTM reporting, PM/ops
  review dashboards, and game/business telemetry views. Use when the real job is
  shaping the presentation layer, refresh strategy, and dashboard interaction on
  top of curated BigQuery data — not generic dataset analysis or broad data
  engineering. Triggers on: Looker Studio, Data Studio, BigQuery dashboard,
  marketing dashboard, KPI board, exec dashboard, PM review dashboard, funnel
  dashboard, retention dashboard, live-ops dashboard, scheduled-query reporting,
  BI Engine, Connected Sheets handoff.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best when the workspace can edit SQL, dashboard specs, and repo files for
  reporting definitions. This skill assumes BigQuery is already available or can
  be referenced conceptually; it is not a full GCP project bootstrap skill.
license: MIT
metadata:
  tags: looker-studio, bigquery, dashboard, kpi, analytics, reporting, marketing, pm-ops, live-ops, bi-engine
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0.0"
  modernization: 2026-04-15
---

# Looker Studio + BigQuery

Use this skill when the real deliverable is a **trustworthy stakeholder dashboard layer on top of BigQuery**.

`looker-studio-bigquery` is the dashboard/reporting handoff for:
- PM and ops KPI review boards
- product funnel, retention, and cohort dashboards already modeled in BigQuery
- marketing / GTM channel and revenue reporting
- game / live-ops / monetization dashboards for studio review
- refresh, cost, and interaction decisions for Looker Studio on curated warehouse data

Read these support docs before choosing the workflow:
- [references/modes-and-routing.md](references/modes-and-routing.md)
- [references/modeling-refresh-and-cost.md](references/modeling-refresh-and-cost.md)
- [references/dashboard-delivery-checklist.md](references/dashboard-delivery-checklist.md)

## When to use this skill
- The user explicitly wants **Looker Studio / Data Studio + BigQuery** help.
- The dataset already lives in BigQuery, or the reporting layer will clearly sit on BigQuery tables/views.
- The main job is dashboard structure, refresh strategy, filter behavior, audience-specific scorecards, or stakeholder-ready delivery.
- The request is about KPI boards, funnel/retention dashboards, exec reporting, marketing performance dashboards, or game/business telemetry dashboards.
- The real risk is dashboard trust, refresh cost, or interaction design rather than raw SQL analysis alone.

## When not to use this skill
- **The main job is interpreting a CSV/export, experiment result, or KPI drop** → use `data-analysis`
- **The main job is repeated anomaly/rule hunting across metrics or events** → use `pattern-detection`
- **The main job is telemetry reliability, monitoring coverage, or alert design** → use `monitoring-observability`
- **The main job is full semantic modeling / governed BI platform design across many teams** → use `survey` or a warehouse / BI architecture workflow first
- **The main job is broad GCP/bootstrap/deploy work** → use the relevant infrastructure or cloud skill first

## Instructions

### Step 1: Classify the reporting job before designing charts
Normalize the request first.

```yaml
looker_studio_bigquery_mode:
  primary_mode: dashboard-build | performance-hardening | refresh-cost | audience-routing | migration-review
  audience: executive | pm-ops | product-analytics | marketing-gtm | game-liveops | mixed | unknown
  data_shape: curated-table | view | scheduled-query-output | raw-fact-table | mixed | unknown
  freshness_need: near-real-time | hourly | daily | weekly | unknown
  interaction_need: scorecard | trend | drilldown | filters | export-handoff | mixed
  trust_risk: low | medium | high
```

Choose exactly one primary mode for the run:
- `dashboard-build` → new or revised stakeholder dashboard on top of curated BigQuery data
- `performance-hardening` → dashboard is too slow, too expensive, or too brittle
- `refresh-cost` → the real question is live query vs scheduled table vs extract/snapshot behavior
- `audience-routing` → one dashboard is trying to serve conflicting stakeholders
- `migration-review` → compare Looker Studio with a heavier BI/semantic option instead of blindly staying here

### Step 2: Verify that the dashboard should stay thin
Before editing dashboard structure, answer these:
1. **What decision or review ritual does the dashboard support?**
2. **What table/view should be the source of truth?**
3. **Which metrics must be precomputed in BigQuery instead of report-level formulas?**
4. **Who owns the data refresh and trust checks?**

If the request still depends on raw event tables, ad hoc joins, or unstable metric definitions, push that modeling work upstream before overdesigning the report.

### Step 3: Choose the right mode

#### A. Dashboard-build
Use when the user needs a new dashboard or a serious redesign.

Output packet should include:
- dashboard purpose and audience
- page/section structure
- KPI scorecards and definitions
- required filters and drill paths
- chart-to-question mapping
- BigQuery source tables/views
- trust and freshness notes

Recommended structure:
1. top-line scorecards
2. one main trend or comparison area
3. segment or drilldown view
4. detail table or export surface
5. caveats / freshness / owner metadata

#### B. Performance-hardening
Use when dashboards feel slow, expensive, or fragile.

Check in this order:
1. Is the dashboard reading raw fact tables instead of curated marts/views?
2. Are joins or expensive calculations happening too late?
3. Can a scheduled query or materialized view precompute the repeated work?
4. Does the audience really need live freshness?
5. Is BI Engine or caching worth enabling for this workload?

Do not treat chart cosmetics as the fix for a warehouse-shape problem.

#### C. Refresh-cost
Use when the real question is **live vs scheduled vs snapshot**.

Compare:
- direct query against curated table/view
- scheduled-query output table
- materialized view
- BI Engine acceleration
- export / Connected Sheets handoff for the last mile

Default bias:
- hourly/daily stakeholder reporting usually prefers precomputed tables
- only keep dashboards closer to live when the review ritual truly needs it

#### D. Audience-routing
Use when one dashboard is trying to serve incompatible readers.

Common split:
- **exec / leadership** → fewer charts, higher stability, stronger freshness/trust labels
- **PM / analyst / ops** → more filters, segment views, and detail tables
- **marketing / growth** → channel dimensions, pacing, targets, and export handoffs
- **game / live-ops** → cohort/time windows, regional splits, event/state segmentation, anomaly callouts

If the dashboard keeps accumulating exceptions, split it by audience rather than forcing one artifact to do everything.

#### E. Migration-review
Use when the user is really asking whether Looker Studio should remain the surface at all.

Escalation signs:
- many teams need governed reusable metrics
- row-level access and semantic reuse dominate the work
- dashboard logic is duplicated across many reports
- stakeholders want stronger self-serve exploration than thin dashboards can provide

If those dominate, compare Looker Studio with a heavier BI/semantic route instead of pretending a dashboard tweak will solve it.

### Step 4: Define the BigQuery contract for the dashboard
For each dashboard page or section, specify:
- source table/view name
- grain
- primary dimensions
- primary metrics
- freshness source and expected lag
- owner
- known caveats

Example packet:

```yaml
dashboard_contract:
  source: analytics.reporting_daily_kpis
  grain: date x segment
  dimensions: [date, segment, country, platform]
  metrics: [active_users, revenue, conversion_rate]
  freshness: daily at 08:00 UTC
  owner: analytics
  caveats:
    - excludes sandbox traffic
    - conversion uses paid-checkout definition v2
```

If you cannot state this contract clearly, the dashboard is not ready for stakeholder trust.

### Step 5: Map questions to dashboard components
Build charts from decision questions, not from widget inventory.

Typical mapping:
- **Are we up or down?** → KPI scorecards + trend line
- **Where is the change coming from?** → segmented bar / breakdown table
- **Which slice needs action?** → filtered comparison + detail table
- **What should leadership trust?** → freshness stamp + caveats + owner
- **What needs external distribution?** → export or Connected Sheets handoff plan

Prefer fewer charts with a clear narrative over a dense wall of widgets.

### Step 6: Design refresh, cost, and reliability intentionally
Use this order:
1. decide freshness target from the business ritual
2. precompute repeated heavy logic in BigQuery when possible
3. minimize report-level calculated-field sprawl
4. separate stakeholder pages from analyst/debug pages
5. document the refresh and ownership contract in the deliverable

Common patterns:
- daily exec dashboard → scheduled-query table + thin Looker Studio page
- marketing performance board → scheduled-query funnel/channel mart + export/sheet handoff
- game live-ops board → curated telemetry table + segmented trend pages + explicit freshness note
- PM review board → KPI scorecards, trend, drilldown, and a detail table tied to one review cadence

### Step 7: Produce the dashboard packet, not just chart notes
Default output should include:
- recommended mode
- dashboard sections/pages
- chart-to-question mapping
- BigQuery contract summary
- refresh/cost strategy
- route-outs for upstream modeling or downstream handoff

Good deliverables:
- dashboard spec markdown
- metric dictionary for report fields
- SQL handoff list for upstream modeling
- stakeholder delivery checklist

### Step 8: Route out honestly
- If the user really needs **dataset reasoning or KPI interpretation**, route to `data-analysis`.
- If the user really needs **repeated anomaly detection**, route to `pattern-detection`.
- If the user really needs **telemetry/alerting coverage**, route to `monitoring-observability`.
- If the user really needs **full BI stack comparison or semantic-platform choice**, route to `survey` before pretending Looker Studio is the answer.

## Examples

### Example 1: PM / ops dashboard build
Input:
- BigQuery table of product events and weekly KPI definitions
- request for a leadership-ready PM review dashboard

Output:
- dashboard-build mode
- KPI + trend + segment drilldown structure
- daily refresh contract
- route-out for any metric that still needs upstream SQL modeling

### Example 2: Marketing funnel report with cost issues
Input:
- BigQuery funnel model
- request to make a slow Looker Studio dashboard cheaper and more reliable

Output:
- performance-hardening or refresh-cost mode
- recommendation to precompute funnel stages in scheduled tables
- clear split between stakeholder dashboard and export/sheet handoff

### Example 3: Game live-ops reporting
Input:
- BigQuery telemetry tables for payer behavior and regional retention
- request for a live-ops review dashboard

Output:
- audience-specific dashboard packet
- freshness note matched to the studio ritual
- chart plan for retention, payer mix, and region/event slices

## Best practices
1. Keep Looker Studio thin; do the heavy logic in BigQuery whenever possible.
2. Start from the review ritual and decision question, not from chart types.
3. Treat freshness, cost, and trust as first-class design constraints.
4. Split dashboards by audience when one artifact keeps absorbing conflicting needs.
5. Make source grain, owner, and caveats explicit in every serious dashboard handoff.
6. Use route-outs instead of pretending every reporting problem belongs in this skill.

## References
- [BigQuery: Visualize data in Looker Studio](https://cloud.google.com/bigquery/docs/visualize-looker-studio)
- [BigQuery scheduled queries](https://cloud.google.com/bigquery/docs/scheduling-queries)
- [BigQuery materialized views](https://cloud.google.com/bigquery/docs/materialized-views-intro)
- [BigQuery BI Engine](https://cloud.google.com/bigquery/docs/bi-engine-intro)
- [Connected Sheets for BigQuery](https://cloud.google.com/bigquery/docs/connected-sheets)
