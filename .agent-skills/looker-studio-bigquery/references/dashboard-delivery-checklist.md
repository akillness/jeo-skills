# Dashboard delivery checklist

## Before building
- Name the audience and the review ritual.
- State the BigQuery source table/view and grain.
- List the KPI definitions that must stay stable.
- Decide the freshness target.
- Note the owner and trust risks.

## Before calling the dashboard ready
- Every chart answers a real question.
- Top-line KPIs appear before detail.
- Filters do not hide metric-definition drift.
- Freshness and caveats are visible somewhere in the deliverable.
- The report can survive schema or pipeline changes without silent ambiguity.
- Audience split is explicit if executives and analysts need different surfaces.

## Handoff packet
Include:
- dashboard purpose
- audience
- page structure
- chart-to-question map
- BigQuery contract summary
- refresh strategy
- export / Connected Sheets handoff if needed
- route-outs for upstream modeling work

## Quality red flags
- too many charts with no narrative order
- report-level formulas nobody can audit
- direct use of raw fact tables for every page interaction
- one dashboard trying to solve both explanation and monitoring
- no owner/freshness/caveat note for decision-critical metrics
