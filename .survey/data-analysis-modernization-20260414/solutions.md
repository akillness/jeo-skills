# Solution Landscape: data-analysis modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Pandas + Jupyter | Python dataframe + notebook workflow | Flexible exploratory analysis, rich ecosystem, reproducible narrative + code | Easy to devolve into ad hoc notebooks; weak sharing without extra structure | Strong default for agent-assisted exploratory analysis ([pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html), [Jupyter](https://jupyter.org/)) |
| DuckDB + notebooks | Local SQL engine layered into notebook flow | Fast on local files, SQL-friendly, good bridge from CSV to analysis | Still needs workflow discipline and reporting handoff | Repeatedly surfaced in indexed results as the modern lightweight stack ([DuckDB guide](https://duckdb.org/docs/stable/guides/python/jupyter)) |
| Deepnote | Collaborative notebook workspace | Team collaboration, Python + SQL in one place, shareable notebooks | Product-specific workflow; not the same thing as a generic analysis method | Good example of collaborative analysis surface ([Deepnote](https://deepnote.com/)) |
| Metabase / BI dashboards | Question-driven dashboard/reporting layer | Broad accessibility, easier stakeholder consumption, self-serve dashboards | Often requires exports or follow-up analysis outside the dashboard | Better handoff/reporting layer than exploratory-analysis anchor ([Metabase](https://www.metabase.com/)) |
| Excel / Sheets + Python in Excel | Spreadsheet-first analysis with optional code assist | Familiar, fast for small datasets, easy collaboration | Error-prone at scale, weak reproducibility, export churn persists | Still central in real workflows; should be acknowledged, not mocked ([Microsoft Support](https://support.microsoft.com/en-us/office/introduction-to-python-in-excel-55643c2e-ff56-4168-b1ce-9428c8308545)) |
| Datadog Notebooks / Sheets / DDSQL | Telemetry-specific multi-surface analysis stack | Explicitly supports code, point-and-click, and SQL modes in one product | Vendor-specific; biased toward observability/telemetry contexts | Useful model for mode selection inside the skill ([Datadog](https://www.datadoghq.com/blog/advanced-analysis-tools/)) |
| PlayFab telemetry + downstream analysis | Game event ingestion feeding later analysis | Clear telemetry pipeline framing for game workflows | Telemetry ingestion alone does not solve analysis framing or communication | Useful to keep game telemetry in scope without turning the skill into a PlayFab guide ([PlayFab](https://learn.microsoft.com/en-us/gaming/playfab/data-analytics/ingest-data/telemetry-overview)) |
| Streamlit-style data apps | Turn analysis outputs into lightweight apps | Good for sharing findings and interactive slices | Not the core exploratory workflow; better as a handoff stage | Adjacent, not canonical, for the skill boundary ([Streamlit](https://streamlit.io/)) |

## Categories
- **Exploratory analysis anchors:** Pandas + Jupyter, DuckDB + notebooks
- **Collaborative notebook layers:** Deepnote
- **Dashboard / consumption layers:** Metabase, Looker/BI-style tools, GA4 reporting
- **Spreadsheet-first bridges:** Excel, Google Sheets, Python in Excel
- **Telemetry-specialist stacks:** Datadog advanced analysis surfaces, PlayFab telemetry pipelines
- **Presentation / app handoff layers:** Streamlit and dashboard builders

## What People Actually Use
In practice, teams mix tools instead of picking one permanent stack. The recurring pattern is export or query raw data, inspect and clean it in spreadsheets/SQL/notebooks, then publish a narrower stakeholder-facing output via dashboards, reports, or lightweight apps. Even vendors with strong dashboards still document export paths, and telemetry vendors increasingly expose multiple analysis surfaces because actual work shifts between quick tables, SQL, and notebook reasoning.

## Frequency Ranking
1. **Notebook + Python dataframe workflow** — most consistent exploratory-analysis default across product, developer, and analytics sources.
2. **Spreadsheet + export workflow** — still highly persistent in actual operations, especially for PM/ops/marketing handoff.
3. **SQL-backed local analysis (DuckDB / warehouse query)** — common bridge once datasets outgrow spreadsheet comfort.
4. **Dashboard / BI reporting** — common destination layer, but often not the full analysis workflow.
5. **Collaborative notebook / app sharing tools** — valuable, but secondary to the core explore → explain pipeline.

## Key Gaps
- Many solution surfaces optimize either exploration or presentation, but not the full question → audit → analyze → communicate workflow.
- Vendor docs rarely teach boundary management between ordinary analysis, anomaly detection, and dashboard production.
- Real workflows still need export-friendly, mixed-mode guidance because teams bounce between spreadsheet, SQL, notebook, and dashboard contexts.
- Game/product telemetry examples emphasize ingestion or dashboards more than evidence-backed synthesis and recommendation language.

## Contradictions
- **Marketed claim:** dashboards or collaborative analytics products can centralize the workflow.  
  **Observed reality:** teams still export to CSV/Sheets/PDF, ask for missing export paths, and shift into notebooks or spreadsheets for final reasoning.
- **Marketed claim:** spreadsheet alternatives replace spreadsheet dependence.  
  **Observed reality:** spreadsheet-first work persists because it is fast, familiar, and often the easiest handoff surface.
- **Marketed claim:** telemetry products solve analysis by collecting more events.  
  **Observed reality:** event volume still needs framing, quality checks, segmentation, and narrative interpretation.

## Key Insight
The strongest reusable `data-analysis` skill is not a tool tutorial. It should act like a workflow router: clarify the decision question, audit data quality, choose the right analysis mode (spreadsheet, SQL, notebook, telemetry slice), separate baseline exploration from anomaly hunting, and finish with evidence-backed findings plus explicit next-step handoffs to dashboarding or specialist skills. That makes the skill durable across developer workflow, web/product analytics, marketing operations, and game telemetry work without turning it into a vendor-specific cheat sheet.
