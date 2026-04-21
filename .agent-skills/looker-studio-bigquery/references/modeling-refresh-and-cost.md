# Modeling, refresh, and cost notes

## Durable rule
The stack works best when **BigQuery owns the heavy lifting and Looker Studio stays thin**.

## What to push into BigQuery
Push upstream when you see:
- repeated joins across large tables
- derived funnel stages or retention cohorts
- expensive calculated fields used on many charts
- audience-specific KPI definitions that need stable governance
- dashboards depending on raw fact/event tables for every interaction

Good upstream candidates:
- scheduled-query output tables
- reporting marts
- denormalized views for dashboard use
- materialized views for repeated aggregations
- explicit metric dictionaries documented alongside the report

## Freshness ladder
Choose the cheapest freshness that still supports the business ritual:
1. **Weekly / monthly review** → snapshot or scheduled output table
2. **Daily leadership / PM / marketing review** → daily scheduled-query table or refreshed mart
3. **Hourly operations view** → hourly materialization or carefully scoped direct query
4. **Near-real-time need** → justify direct query or BI Engine only when the ritual truly demands it

## Cost and performance checks
- Is the report scanning raw history when only a recent slice is needed?
- Can filters operate on curated dimensions instead of expensive expressions?
- Are repeated calculations duplicated in many charts?
- Does the audience need one combined report, or would smaller pages be cheaper and clearer?
- Would BI Engine help, or is the underlying query shape still too messy?

## Common decisions
- **Exec dashboard** → stable precomputed table, fewer filters, explicit freshness label
- **Marketing board** → scheduled-query funnel/channel mart plus export handoff for final commentary
- **PM review board** → curated KPI mart with drilldown page for analysts, simplified top page for leadership
- **Game live-ops board** → segmented telemetry table with controlled freshness note and explicit caveats

## Anti-patterns
- Insisting on live freshness for a ritual that only happens weekly
- Hiding business logic in many calculated fields that nobody owns
- Using one dashboard as both the analyst workbench and the stakeholder surface
- Treating export/sheet handoff as failure instead of a normal last-mile workflow
