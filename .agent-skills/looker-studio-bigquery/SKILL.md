---
name: looker-studio-bigquery
description: >
  Route BigQuery-backed Looker Studio work into one stakeholder-reporting packet:
  dashboard-spec, slow-dashboard triage, refresh-shape choice, audience split, or
  exec-handoff. Use when the user needs KPI boards, PM/ops reviews, marketing / GTM
  reporting, product funnel summaries, or game/live-ops telemetry dashboards on top
  of curated BigQuery data. Route KPI explanation to `data-analysis`, repeated
  anomaly hunting to `pattern-detection`, telemetry/alerting coverage to
  `monitoring-observability`, and semantic-platform choice to `survey`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best when the workspace can inspect SQL, reporting specs, and repo files tied to
  dashboard delivery. Assumes BigQuery already exists or can be reasoned about; this
  is not a full GCP bootstrap skill.
license: MIT
metadata:
  tags: looker-studio, data-studio, bigquery, dashboard, kpi, analytics, reporting, marketing, pm-ops, live-ops, bi-engine
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  modernization: 2026-04-15
  structural_hardening: 2026-04-19
---

# Looker Studio + BigQuery

Use this skill when the real deliverable is **one trustworthy stakeholder-reporting packet on top of BigQuery**.

`looker-studio-bigquery` owns the reporting layer for:
- PM / ops KPI review boards
- product funnel, retention, and rollout dashboards already modeled in BigQuery
- marketing / GTM channel and revenue reporting
- game / live-ops / business telemetry review boards
- refresh, cost, audience, and export-handoff decisions for Looker Studio on curated data

Read these support docs first when needed:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/modeling-refresh-and-cost.md](references/modeling-refresh-and-cost.md)
- [references/dashboard-delivery-checklist.md](references/dashboard-delivery-checklist.md)
- [references/modes-and-routing.md](references/modes-and-routing.md)

## When to use this skill
- The user explicitly wants **Looker Studio / Data Studio + BigQuery** help.
- The data already lives in BigQuery, or the dashboard clearly sits on curated BigQuery tables/views.
- The main job is dashboard structure, refresh/cost shape, audience-specific delivery, or export-ready reporting.
- The request is about KPI boards, PM/ops reviews, marketing/GTM reporting, product summary dashboards, or game/business telemetry dashboards.
- The real risk is dashboard trust, refresh design, or mixed-audience sprawl rather than raw SQL interpretation alone.

## When not to use this skill
- **The main job is explaining why a KPI moved or what the dataset means** → use `data-analysis`
- **The main job is repeated anomaly hunting or reusable rule scans across metrics/events** → use `pattern-detection`
- **The main job is telemetry reliability, alerting, or instrumentation coverage** → use `monitoring-observability`
- **The main job is choosing a full BI / semantic platform** → use `survey`
- **The main job is broad GCP/bootstrap/deploy work** → route to the relevant infrastructure skill first

## Instructions

### Step 1: Pick one primary packet before talking about charts
Normalize the request into one packet.

```yaml
looker_studio_bigquery_packet:
  primary_packet: dashboard-spec | slow-dashboard | refresh-shape | audience-split | exec-handoff
  audience: executive | pm-ops | product-analytics | marketing-gtm | game-liveops | mixed | unknown
  source_shape: curated-table | view | scheduled-query-output | materialized-view | mixed | unknown
  freshness_need: near-real-time | hourly | daily | weekly | unknown
  trust_risk: low | medium | high
```

Pick exactly one `primary_packet`:
- `dashboard-spec` — build or redesign a stakeholder dashboard
- `slow-dashboard` — fix a dashboard that is slow, expensive, or brittle
- `refresh-shape` — decide live vs scheduled vs snapshot vs BI Engine
- `audience-split` — separate one overloaded report into audience-specific artifacts
- `exec-handoff` — produce a thin dashboard plus export/sheet/deck handoff for commentary and approvals

If two packets seem plausible, choose the one that removes the biggest delivery risk first.

### Step 2: Keep the dashboard thin on purpose
Before designing sections, answer these:
1. What review ritual or decision does this dashboard support?
2. What table/view is the source of truth?
3. Which metrics belong in BigQuery instead of report-level formulas?
4. Who owns freshness, trust checks, and caveats?

If the request still depends on raw fact tables, unstable joins, or fuzzy metric definitions, say so and push modeling work upstream before polishing the dashboard.

### Step 3: Shape the packet, not a generic BI essay
Use the packet guidance in [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Minimum packet expectations:
- `dashboard-spec` → page structure, KPI set, chart-to-question mapping, and BigQuery contract
- `slow-dashboard` → bottleneck order, upstream precompute options, and one shortest-path fix
- `refresh-shape` → live vs scheduled vs snapshot choice tied to the real review cadence
- `audience-split` → artifact split by stakeholder ritual, trust need, and detail depth
- `exec-handoff` → thin dashboard plus Connected Sheets / export / slide handoff plan

Do not answer with a generic chart buffet.

### Step 4: Return a delivery brief
Use this structure:

```markdown
# Looker Studio Delivery Brief

## Primary packet
- Packet: ...
- Audience: ...
- Confidence: high | medium | low

## Review ritual and question
- Ritual: ...
- Decisions supported: ...

## BigQuery contract
- Source table/view: ...
- Grain: ...
- Core dimensions: ...
- Core metrics: ...
- Freshness / owner / caveats: ...

## Recommended dashboard shape
- Pages or sections: ...
- KPI and chart-to-question mapping: ...
- Filters / drilldowns / export needs: ...

## Refresh, cost, and trust plan
- Preferred refresh shape: ...
- Heavy logic to move upstream: ...
- Trust or caveat notes: ...

## Recommended next artifact
- Choose one: dashboard spec | SQL handoff list | refresh decision memo | audience split brief | export / Connected Sheets handoff

## Route-outs
- Upstream modeling / KPI interpretation / anomaly hunting / observability / platform comparison as needed
```

### Step 5: Route out honestly
- If the user needs **dataset reasoning or KPI explanation**, route to `data-analysis`.
- If the user needs **repeated anomaly detection or reusable metric rules**, route to `pattern-detection`.
- If the user needs **telemetry coverage, alerting, or instrumentation trust**, route to `monitoring-observability`.
- If the user needs **a heavier BI or semantic-platform decision**, route to `survey`.

## Examples

### Example 1: PM / ops dashboard build
**Input**
> Build a leadership-ready PM review dashboard in Looker Studio on top of BigQuery weekly KPIs.

**Output sketch**
- Packet: `dashboard-spec`
- Dashboard shape: KPI scorecards + main trend + one drilldown + owner/freshness notes
- Next artifact: `dashboard spec`

### Example 2: Slow marketing board
**Input**
> Our marketing funnel dashboard is too slow and expensive whenever people touch filters.

**Output sketch**
- Packet: `slow-dashboard` or `refresh-shape`
- Primary recommendation: precompute the repeated funnel logic in BigQuery before styling changes
- Next artifact: `refresh decision memo` or `SQL handoff list`

### Example 3: Mixed audience dashboard
**Input**
> One board is trying to serve executives, PMs, growth, and live-ops. Should we keep patching it?

**Output sketch**
- Packet: `audience-split`
- Recommendation: split the artifact by decision ritual and trust needs
- Next artifact: `audience split brief`

### Example 4: Commentary-friendly handoff
**Input**
> Leadership wants a weekly board, but they still annotate numbers in Sheets before the review.

**Output sketch**
- Packet: `exec-handoff`
- Recommendation: keep the dashboard thin and define the export / Connected Sheets handoff explicitly
- Next artifact: `export / Connected Sheets handoff`

## Best practices
1. Start from the current packet, not from chart types.
2. Keep heavy logic in BigQuery whenever possible.
3. Tie freshness to the real review ritual instead of pretending everything must be live.
4. Split dashboards by audience when one artifact keeps absorbing incompatible needs.
5. Name the owner, caveats, and trust contract in every serious dashboard handoff.
6. Prefer route-outs over stuffing analysis, anomaly hunting, or observability into this skill.

## References
- [BigQuery: Visualize data in Looker Studio](https://cloud.google.com/bigquery/docs/visualize-looker-studio)
- [BigQuery scheduled queries](https://cloud.google.com/bigquery/docs/scheduling-queries)
- [BigQuery materialized views](https://cloud.google.com/bigquery/docs/materialized-views-intro)
- [BigQuery BI Engine](https://cloud.google.com/bigquery/docs/bi-engine-intro)
- [Connected Sheets for BigQuery](https://cloud.google.com/bigquery/docs/connected-sheets)
