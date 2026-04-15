# Context: looker-studio-bigquery modernization

## Workflow Context
Looker Studio + BigQuery usually appears as the **lightweight warehouse-to-dashboard path** for PM/ops reviews, product analytics rollups, marketing/GTM reporting, and game/business telemetry. BigQuery holds the joined history and heavy SQL; Looker Studio becomes the stakeholder-facing presentation layer for KPI scorecards, trend charts, filters, and recurring review decks. Official docs frame this as a standard BigQuery visualization workflow rather than a full semantic-model stack ([BigQuery → Looker Studio visualization](https://cloud.google.com/bigquery/docs/visualize-looker-studio), [Looker Studio BigQuery connector](https://support.google.com/looker-studio/answer/6370296?hl=en)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Product manager / PM ops | Weekly KPI review, funnel/feature dashboards, roadmap status evidence | Low-SQL to medium |
| Marketing / GTM analyst | Campaign pacing, CAC/ROAS, channel mix, revenue rollups | Medium |
| Business ops / leadership reporting owner | Exec dashboards and recurring business reviews | Medium |
| Game producer / liveops / monetization analyst | Revenue, retention, region, and live-ops telemetry dashboards | Medium |
| Analytics engineer / data analyst | Models reporting tables, views, refresh patterns, and report QA | Medium to high |

## Current Workarounds
1. **Push complexity into BigQuery first** — build views, scheduled queries, reporting marts, or materialized views so the dashboard reads presentation-ready tables instead of raw warehouse schemas ([scheduled queries](https://cloud.google.com/bigquery/docs/scheduling-queries), [materialized views](https://cloud.google.com/bigquery/docs/materialized-views-intro)).
2. **Keep Looker Studio thin** — prefer warehouse SQL for joins, metric definitions, and expensive transforms instead of duplicating logic in report-level calculated fields.
3. **Trade freshness for usability** — snapshot or pre-aggregate when direct BigQuery queries are too slow or costly for stakeholder-facing filters ([BigQuery performance best practices](https://cloud.google.com/bigquery/docs/best-practices-performance-compute)).
4. **Use BI Engine selectively** for high-traffic interactive dashboards, while still simplifying schemas upstream ([BI Engine](https://cloud.google.com/bigquery/docs/bi-engine-intro)).
5. **Export to Sheets/slides for the last mile** when the real workflow still needs commentary, approvals, targets, or executive narration outside the dashboard ([Connected Sheets](https://cloud.google.com/bigquery/docs/connected-sheets), [Connected Sheets help](https://support.google.com/docs/answer/9703001)).
6. **Split reports by audience** instead of building one deeply parameterized artifact with conflicting permissions, metric definitions, and performance expectations.

## Adjacent Problems
- Dashboard latency and BigQuery query cost rise together when raw fact tables stay too close to the presentation layer.
- Metric logic drifts when some business rules live in SQL, some in Looker Studio calculated fields, and some in spreadsheet or slide handoffs.
- Permissions and self-serve access are awkward when connector credentials, row-level expectations, and broad business sharing do not align.
- Schema changes or ETL changes quietly break charts and filters downstream.
- Compared with dedicated product analytics tools, Looker Studio needs much more warehouse modeling before funnels, cohorts, or retention views feel usable.

## User Voices
- Community traffic clusters around **performance, blending, freshness, and calculated-field limits** rather than pure dashboard design, which suggests practitioners experience this stack as a workflow-assembly and modeling problem, not just a charting problem ([Stack Overflow `google-data-studio` tag](https://stackoverflow.com/questions/tagged/google-data-studio), [Google developer community Looker Studio tag](https://discuss.google.dev/tag/looker-studio)).
- Google’s own docs implicitly reinforce the same reality: they emphasize connector setup, warehouse-backed modeling, and BigQuery-side optimization rather than promising rich semantic governance in the report layer ([BigQuery → Looker Studio visualization](https://cloud.google.com/bigquery/docs/visualize-looker-studio), [BigQuery performance best practices](https://cloud.google.com/bigquery/docs/best-practices-performance-compute)).
- The clearest repeated operator pattern is: **do the hard stuff in BigQuery, keep Looker Studio thin**.
