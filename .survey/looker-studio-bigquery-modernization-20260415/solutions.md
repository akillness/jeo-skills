# Solution Landscape: looker-studio-bigquery modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Looker Studio + BigQuery | Google-native direct BI/reporting layer on warehouse tables/views | Fast internal sharing, easy stakeholder access, low-friction dashboard setup | Thin semantic/governance layer, performance/cost pressure on live queries | Best fit when the job is lightweight dashboard delivery over curated BigQuery data ([docs](https://cloud.google.com/bigquery/docs/visualize-looker-studio)) |
| Looker + BigQuery | Governed semantic BI with LookML/explores | Strong metric governance, reusable semantic layer, row-level control | Heavier setup and modeling overhead | Escalation path when Looker Studio becomes too thin ([docs](https://cloud.google.com/bigquery/docs/visualize-looker)) |
| Tableau + BigQuery | Enterprise BI with live/extract BigQuery connections | Mature enterprise dashboarding and analyst workflows | Extra stack complexity outside Google-native tooling | Common in mixed-cloud orgs ([docs](https://help.tableau.com/current/pro/desktop/en-us/examples_googlebigquery.htm)) |
| Power BI + BigQuery | Microsoft-centric BI over BigQuery warehouse data | Strong semantic modeling and distribution in M365 shops | Less Google-native, extra modeling layer | Common in Microsoft-heavy organizations ([docs](https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-connect-google-bigquery)) |
| Metabase / Superset / OSS BI | Lower-cost or open-source SQL-first dashboarding | Cost/flexibility, engineering-led control | Less polished sharing/governance depending on stack | Relevant alternatives for internal ops/reporting ([Metabase](https://www.metabase.com/data_sources/bigquery), [Superset](https://superset.apache.org/docs/configuration/databases)) |
| Connected Sheets / spreadsheet handoff | Spreadsheet last-mile reporting on top of BigQuery | Familiar review, comments, targets, ad hoc manipulation | Weak governance and dashboard UX for recurring BI | Very common companion workflow for ops/finance/exec review ([docs](https://cloud.google.com/bigquery/docs/connected-sheets)) |
| Scheduled-query materialization | Precompute reporting tables before BI | Lower cost, faster refresh, simpler dashboards | More pipeline upkeep, possible freshness lag | Core workaround pattern rather than a BI product ([docs](https://cloud.google.com/bigquery/docs/scheduling-queries)) |
| dbt / semantic-layer prep | Curate marts/tests/metrics before BI | Strong warehouse discipline, reusable models, cleaner route-outs | Extra transformation layer to maintain | Important when BI demand outgrows direct connector usage ([dbt BigQuery](https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup), [dbt Semantic Layer](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl)) |

## Categories
- **Google-native lightweight BI** — Looker Studio, Connected Sheets
- **Governed semantic BI** — Looker, dbt semantic prep, Lightdash-style layered approaches
- **Enterprise cross-platform BI** — Tableau, Power BI, Sigma, ThoughtSpot
- **Open-source / engineering-led BI** — Metabase, Superset
- **Workflow patterns around BigQuery** — scheduled queries, materialized views, curated marts, thin presentation layer

## What People Actually Use
Practitioners commonly mix tools instead of staying inside one perfect BI surface:
- BigQuery for joins/history
- scheduled queries or reporting marts for speed/cost control
- Looker Studio for stakeholder dashboards
- Sheets/slides/PDF exports for the last-mile review package
- occasional BI Engine acceleration for high-traffic dashboards ([BI Engine](https://cloud.google.com/bigquery/docs/bi-engine-intro))

## Frequency Ranking
1. Looker Studio + BigQuery
2. Spreadsheet / Connected Sheets handoff on top of BigQuery
3. Power BI + BigQuery
4. Tableau + BigQuery
5. Looker + BigQuery
6. Scheduled-query / reporting-mart workflow
7. dbt-style semantic prep feeding BI
8. Metabase / Superset / adjacent OSS BI

## Key Gaps
- The market has plenty of BI tools, but teams still need a **decision-first handoff skill** for when Looker Studio is the right presentation layer versus when the real job is warehouse modeling, semantic governance, or dataset analysis.
- Real usage depends on **thin dashboards over curated tables**, yet many tutorials still teach the stack like a direct-connector feature tour.
- The missing operational surface is often **refresh/cost/performance design**, not chart selection.

## Contradictions
- Vendor positioning suggests near-live self-serve dashboards, but operator reality often trades freshness for cheaper, faster, more stable precomputed tables.
- “Simple dashboarding” sounds low-effort, but trustworthy KPI delivery usually requires warehouse-side modeling, permissions planning, and audience-specific artifacts.
- Teams say they want one dashboard source of truth, yet many still export to Sheets or decks for the actual approval and narrative workflow.

## Key Insight
`looker-studio-bigquery` should not be a generic BI command dump. The durable role is **BigQuery-backed dashboard/reporting build-out for stakeholder consumption**, with explicit routing boundaries: use `data-analysis` for reasoning from datasets, use warehouse/modeling tools for metric preparation, and use this skill when the ask is specifically to shape a trustworthy, performant, audience-ready dashboard layer on top of curated BigQuery data.
