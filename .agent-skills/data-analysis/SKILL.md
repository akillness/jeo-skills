---
name: data-analysis
description: >
  Analyze datasets with a decision-first workflow. Use when the user needs to
  inspect CSV/JSON/Parquet/SQL extracts, validate data quality, explain trends,
  compare segments, summarize experiment or telemetry results, or turn raw tables
  into evidence-backed findings — even if they ask in domain language like KPI,
  retention, funnel, cohort, revenue, campaign, export, dashboard data, or game
  telemetry. Choose the right lane (spreadsheet-scale triage, SQL slicing,
  notebook/statistical analysis, or stakeholder-ready summary) and hand off
  cleanly to dashboard, anomaly-detection, or implementation skills when needed.
allowed-tools: Read Grep Glob Bash
metadata:
  tags: data-analysis, csv, sql, notebooks, telemetry, experimentation, analytics
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

# Data Analysis

## When to use this skill
- The user has a **dataset, export, report extract, query result, or shaped event / telemetry table** and wants evidence-backed conclusions.
- The task is to **understand what changed**, compare segments, summarize performance, or explain anomalies in business terms.
- The request mentions **CSV, JSON, SQL tables, retention, cohorts, funnels, conversion, spend, telemetry, event exports, or KPIs**.
- The work needs **data-quality checks before conclusions**.
- The user needs a **concise analysis narrative**, not just raw code snippets.

Do **not** use this skill as the main workflow when:
- The main goal is repeated anomaly or code-pattern scanning across code/data assets → use `pattern-detection`.
- The main goal is building or tuning a specific BI dashboard / Looker Studio + BigQuery workflow → use `looker-studio-bigquery`.
- The task is repository navigation or call-site tracing rather than dataset reasoning → use `codebase-search`.
- The problem is raw log triage / incident reconstruction rather than dataset analysis → use `log-analysis`.

## Core idea
Data analysis is a staged reasoning workflow:
1. clarify the decision question
2. profile the data and trust level
3. choose the cheapest analysis lane that can answer it
4. separate observation from interpretation
5. finish with evidence, caveats, and next actions

Do **not** jump straight into charts or code. The goal is decision-quality analysis.

## Instructions

### Step 1: Frame the analysis question
Before touching the data, define:
- **Decision to support** — what action or judgment depends on this analysis?
- **Primary metric(s)** — conversion, retention, revenue, latency, churn, balance, spend efficiency, etc.
- **Dimensions / segments** — time, channel, cohort, region, plan, device, feature flag, player segment
- **Comparison mode** — before/after, control/treatment, top vs bottom segments, expected vs actual
- **Time window** — day/week/month/release/experiment period

If the request is vague, restate it as:
> "We need to explain [metric/outcome] for [audience] over [time window] and identify the strongest drivers or caveats."

### Step 2: Run a trust check before analysis
Always start with data-quality triage.

#### Minimum trust checklist
- row count / extract size
- schema and types
- missing values / null-heavy columns
- duplicates or repeated IDs
- time range coverage and timezone assumptions
- segment completeness (channels, countries, devices, builds, player groups)
- obvious join / aggregation errors
- outliers or impossible values

Default check pattern:
```python
import pandas as pd

# df = pd.read_csv(...)
print(df.shape)
print(df.dtypes)
print(df.head())
print(df.isna().sum().sort_values(ascending=False).head(15))
print(df.duplicated().sum())
```

If trust is low, stop promising conclusions and explicitly switch the output to:
- what is trustworthy
- what is suspect
- what additional cleanup or data is needed

### Step 3: Choose the analysis lane

| Lane | Use when | Typical tools | What success looks like |
|---|---|---|---|
| Spreadsheet-scale triage | Small extracts, PM/ops handoff, quick KPI sanity checks | Sheets / Excel / quick table review | Fast overview, obvious errors and top movements surfaced |
| SQL slicing | Data already lives in a DB / warehouse or needs grouped filters fast | SQL / DuckDB / warehouse query | Clean aggregates, cohorts, funnels, comparisons |
| Notebook / statistical analysis | Multiple metrics, cohort logic, experiment reasoning, telemetry or richer transformations | pandas / notebooks / scripts | Reproducible calculations and richer interpretation |
| Stakeholder-ready summary | The answer is mostly known and needs explanation, not more slicing | markdown memo / report / dashboard handoff | Clear findings, caveats, actions, and open questions |

Pick the cheapest lane that can answer the question. Escalate only when needed.

### Step 4: Use the right analysis pattern

#### Pattern A — Change explanation
Use for: experiments, release effects, KPI jumps/drops, spend shifts, gameplay balance changes.

Checklist:
1. define baseline and comparison window
2. confirm denominator / assignment integrity when this is an experiment or rollout comparison
3. compute absolute + relative deltas
4. break the change by top segments or drivers
5. test whether the change is broad or concentrated
6. call out confounders (seasonality, launch, tracking changes, sample size, significance/confidence limits)

#### Pattern B — Segment comparison
Use for: channel quality, user tiers, device classes, regions, player cohorts.

Checklist:
1. rank segments by the primary metric
2. include sample size / denominator
3. compare both rate and volume
4. watch for Simpson's-paradox-style aggregation traps
5. explain what likely differentiates top vs bottom groups

#### Pattern C — Funnel / retention analysis
Use for: signup, purchase, onboarding, feature adoption, live-ops progression.

Checklist:
1. define each stage/event clearly
2. compute stage counts and conversion/drop-off rates
3. segment by acquisition source, cohort, platform, build, or player type
4. identify the highest-leverage drop-off point
5. distinguish instrumentation gaps from genuine behavior problems

#### Pattern D — Telemetry / event analysis
Use for: gameplay telemetry, product event streams, operational exports.

Checklist:
1. map raw events to derived metrics
2. group by session/build/feature/segment/time
3. identify spikes, sinkholes, and suspicious clusters
4. separate normal variation from suspicious outliers
5. route sustained anomaly-hunting work to `pattern-detection` if the task becomes detection-first

### Step 5: Keep observations separate from interpretation
Structure findings in three layers:

1. **Observation** — what the data literally shows
2. **Interpretation** — likely meaning or driver
3. **Caveat / confidence** — what could weaken the conclusion

Good example:
- Observation: conversion dropped 6.2% week-over-week, concentrated in mobile Safari traffic.
- Interpretation: the decline is likely connected to the recent checkout UI change on smaller screens.
- Caveat: tracking for one payment method was also modified that week, so attribution is medium confidence.

### Step 6: Return a decision-ready output
Default output shape:

```markdown
## Analysis brief
- Goal: [decision question]
- Data source: [files / tables / export scope]
- Trust level: high | medium | low
- Lane used: spreadsheet triage | SQL slicing | notebook/statistical | summary-only

## Key findings
1. [finding]
2. [finding]
3. [finding]

## Supporting evidence
- [metric / segment / comparison]
- [metric / segment / comparison]

## Caveats
- [missing data / sample bias / instrumentation / seasonality]

## Recommended next actions
- [decision / follow-up slice / dashboard handoff / instrumentation fix]
```

If the user asked for recommendations, tie each recommendation to a specific finding.
If the user only asked for analysis, stop at evidence + caveats.

### Step 7: Route out when analysis stops being the bottleneck
Hand off when the next step is a different job:
- **Repeated anomaly hunting or rule-based scanning** → `pattern-detection`
- **Dashboard construction / BigQuery-connected reporting** → `looker-studio-bigquery`
- **Raw log triage before dataset shaping** → `log-analysis`
- **Repo/code investigation to find instrumentation or metric definitions** → `codebase-search`

## Examples

### Example 1: Experiment analysis
**Prompt:**
> Analyze this CSV export and tell me what changed after the pricing experiment.

**Good response shape:**
- define baseline vs experiment window
- check data coverage and segment completeness
- report overall delta plus segment breakdown
- identify strongest likely drivers and caveats

### Example 2: Marketing + product analysis
**Prompt:**
> We have app event logs and marketing spend by channel; find the main retention and CAC patterns.

**Good response shape:**
- separate acquisition and retention metrics
- compare rate and volume by channel/cohort
- note trust limits if joins or attribution windows are unclear
- summarize high-leverage channel differences

### Example 3: Game telemetry analysis
**Prompt:**
> Review this gameplay telemetry extract and summarize balance issues and suspicious outliers.

**Good response shape:**
- map events to gameplay metrics
- compare player/build/weapon/level segments
- separate broad balance patterns from suspicious outliers
- route repeated anomaly detection to `pattern-detection` if needed

### Example 4: PM / ops export triage
**Prompt:**
> I exported a dashboard to CSV; help me explain the KPI drop for leadership.

**Good response shape:**
- start with trust checks on the export
- identify the metric, time window, and comparison baseline
- produce a concise leadership-ready memo with evidence and caveats

## Best practices
1. Start from the **decision question**, not the chart type.
2. Run **data-quality checks before interpretation**.
3. Always include **sample size / denominator context** when comparing segments.
4. Prefer the **cheapest sufficient lane** instead of defaulting to heavy notebooks.
5. Separate **observation, interpretation, and caveat** so the analysis stays honest.
6. Route dashboard-building and anomaly-detection work to adjacent specialist skills when they become the real task.

## References
- [Project Jupyter](https://jupyter.org/)
- [Pandas getting started tutorials](https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html)
- [DuckDB Jupyter guide](https://duckdb.org/docs/stable/guides/python/jupyter)
- [GA4 share & export reports](https://support.google.com/analytics/answer/9317657?hl=en)

## Output format
Use a brief, findings-first summary with trust level, key evidence, caveats, and explicit next actions or handoffs.
