# Context: data-analysis modernization

## Workflow Context
Modern analysis work still spans multiple surfaces instead of one magical tool. Official Jupyter messaging frames notebooks as a place that combines code, narrative text, visualizations, dashboards, and other media in one interactive environment, which is why notebook-style workflows remain the analysis backbone for exploratory work across engineering, product, marketing, and research contexts ([jupyter.org](https://jupyter.org/)). Pandas still positions its getting-started tutorials as the on-ramp for practical dataframe work, and DuckDB's Jupyter guidance appears repeatedly in indexed search results as the lightweight SQL + notebook path for larger local datasets ([pandas docs](https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html), [DuckDB Jupyter guide](https://duckdb.org/docs/stable/guides/python/jupyter)).

The current market also shows a split between exploratory analysis and shareable outputs. Deepnote sells collaborative Python + SQL notebooks for teams that want one workspace for exploration and handoff, while Metabase positions itself as the easy open-source way for everyone to ask questions and learn from data; that split maps cleanly to a workflow boundary between analysis work and dashboard delivery ([Deepnote](https://deepnote.com/), [Metabase](https://www.metabase.com/)). Datadog's advanced-analysis announcement makes the same point from an observability angle by explicitly offering Notebooks, Sheets, and a SQL editor as separate but connected analysis surfaces for telemetry work ([Datadog](https://www.datadoghq.com/blog/advanced-analysis-tools/)).

Game and product telemetry follow the same shape. PlayFab describes telemetry as an optimized path that skips real-time processing and sends events directly to a telemetry pipeline, which reinforces that gameplay/product analysis usually starts from exported events or warehouse-style tables before any dashboard or balance call is made ([PlayFab telemetry overview](https://learn.microsoft.com/en-us/gaming/playfab/data-analytics/ingest-data/telemetry-overview)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Product / growth analyst | Inspect experiment, funnel, retention, and CAC exports; explain what changed | Mixed: spreadsheet to SQL/notebook |
| Developer / engineering ops | Analyze logs, usage extracts, incident datasets, and performance summaries | SQL / scripting comfortable |
| PM / business ops | Review CSV exports, KPI reports, cohort summaries, and exception lists | Usually spreadsheet-first |
| Marketing operator | Compare channel spend, conversion, and campaign cohorts across exports | Spreadsheet + dashboard familiar |
| Game analyst / gameplay engineer | Read gameplay telemetry, economy/balance extracts, and suspicious outliers | SQL / notebook / BI mixed |

## Current Workarounds
1. Export data from dashboards or product analytics tools into CSV, Google Sheets, or PDF, then continue analysis elsewhere. Google Analytics 4 explicitly supports exporting reports to Google Sheets, PDF, or CSV rather than pretending dashboards alone finish the job ([GA4 help](https://support.google.com/analytics/answer/9317657?hl=en)).
2. Move between spreadsheet work, SQL queries, and notebooks depending on dataset size and complexity. Microsoft now markets Python in Excel directly, which is basically an official acknowledgement that many teams still straddle spreadsheet and code-based analysis ([Microsoft Support](https://support.microsoft.com/en-us/office/introduction-to-python-in-excel-55643c2e-ff56-4168-b1ce-9428c8308545)).
3. Use collaborative notebook tools or lightweight data-app layers for communication after exploratory analysis. Deepnote and Streamlit both sit in this handoff space, while Metabase and BI tools cover the dashboard/reporting end ([Deepnote](https://deepnote.com/), [Streamlit](https://streamlit.io/), [Metabase](https://www.metabase.com/)).
4. For telemetry-heavy environments, keep multiple analysis surfaces in parallel. Datadog explicitly ships notebooks, sheets, and SQL editing together because teams need different interaction styles during the same investigation ([Datadog](https://www.datadoghq.com/blog/advanced-analysis-tools/)).

## Adjacent Problems
- Data-quality and schema issues often block analysis before any insight work starts.
- Teams blur routine analysis with anomaly hunting; that is where `pattern-detection` should stay separate from `data-analysis`.
- Dashboard building gets mixed into analysis requests even when the real task is exploratory reasoning; that is where `looker-studio-bigquery` or BI-specific skills should take over.
- Telemetry/event analysis often becomes a translation problem: raw events → grouped metrics → stakeholder narrative.
- Many workflows still depend on exports because operational tools do not expose the exact slice the analyst needs in-place.

## User Voices
> "You can share a link to a report or export a report to Google Sheets, PDF, or CSV." — Google Analytics Help, direct product documentation showing export-first analysis behavior ([source](https://support.google.com/analytics/answer/9317657?hl=en))

> "Starting to migrate dashboards into the Platform Analytics Experience, but there seems to be no way to export data from a simple list on the dashboard?" — ServiceNow Community thread, direct user voice about dashboard-to-export friction ([source](https://www.servicenow.com/community/platform-analytics-forum/how-to-export-from-a-platform-analytics-experience-dashboard/m-p/3136964))

> "Datadog now offers three powerful tools for advanced analysis—Notebooks, Sheets, and DDSQL Editor—giving teams flexible ways to explore telemetry data using code, point-and-click interfaces, and multi-step workflows." — Datadog product description, direct evidence that teams need multiple analysis modes in one workflow ([source](https://www.datadoghq.com/blog/advanced-analysis-tools/))

> "Almost all (90%) organizations are still relying on outdated spreadsheets..." — DuckDuckGo indexed snippet for a TechRadar article about spreadsheet dependence; useful as secondary evidence for persistent spreadsheet fallback rather than direct source verification (confidence: medium) ([snippet source](https://html.duckduckgo.com/html/?q=analysts+still+use+csv+export+spreadsheet+notebook+despite+dashboard), [article URL](https://www.techradar.com/pro/almost-all-firms-are-still-reliant-on-spreadsheets-is-it-time-for-change))
