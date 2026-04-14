# Analysis Lanes

Use this note when `data-analysis` activates and you need to choose the lightest workflow that still produces decision-quality evidence.

## Lane 1 — Spreadsheet-scale triage
Use when:
- the dataset is small enough to inspect quickly
- the user mostly needs KPI sanity checks, top/bottom rows, or export cleanup
- the next decision is immediate and lightweight

Good fits:
- PM / ops CSV exports
- campaign summaries
- quick cohort comparisons
- one-off leadership questions

Stop and escalate if:
- the dataset is too large or too wide
- repeated filtering/grouping becomes tedious
- you need reproducible transformations or joins

## Lane 2 — SQL slicing
Use when:
- the data is already in SQL or easy to query via DuckDB/warehouse tools
- the answer depends on grouping, joins, time windows, or cohort slices
- you need cleaner denominators than a dashboard export provides

Good fits:
- grouped KPI breakdowns
- conversion/funnel tables
- retention by cohort / acquisition source / device
- gameplay telemetry aggregated by build or segment

Watch for:
- duplicate rows after joins
- timezone mismatches
- counting events instead of users/sessions/orders when the denominator matters

## Lane 3 — Notebook / statistical analysis
Use when:
- the question needs multiple transformations
- the data needs cleanup before grouping
- the user wants richer experimentation, retention, or telemetry reasoning
- you need reproducible logic and more than one table/chart

Good fits:
- experiment analysis
- retention curves / cohort matrices
- feature-adoption analysis
- gameplay balance and telemetry summaries

Do not use this lane just because notebooks feel sophisticated. Use it when the data or reasoning actually demands it.

## Lane 4 — Stakeholder-ready summary
Use when:
- the heavy lifting is done and the real task is explanation
- the audience needs findings, confidence, and next actions
- the agent should convert tables into a memo or decision brief

Required sections:
- goal / metric
- key findings
- supporting evidence
- caveats / trust level
- recommended next actions

## Boundary reminders
- `pattern-detection` owns repeated anomaly hunting and rule-based scanning.
- `looker-studio-bigquery` owns dashboard construction and BigQuery-connected reporting workflows.
- `log-analysis` owns raw log triage before the data becomes a clean dataset.
- `codebase-search` owns repo investigation when you need metric definitions or instrumentation ownership.
