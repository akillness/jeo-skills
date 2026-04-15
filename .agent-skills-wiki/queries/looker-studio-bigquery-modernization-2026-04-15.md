---
title: Looker Studio BigQuery modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [survey, trigger-design, skill-quality, consolidation, docs]
sources: [.survey/looker-studio-bigquery-modernization-20260415/triage.md, .survey/looker-studio-bigquery-modernization-20260415/context.md, .survey/looker-studio-bigquery-modernization-20260415/solutions.md, .agent-skills/looker-studio-bigquery/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Looker Studio BigQuery modernization 2026-04-15

## Question
What is the best bounded improvement for the repo's BigQuery dashboard/reporting lane: add another BI wrapper, merge it into `data-analysis`, or modernize `looker-studio-bigquery` itself?

## Answer
The best bounded move is to **modernize `looker-studio-bigquery` itself** into the BigQuery-backed stakeholder dashboard/reporting anchor.

## Why this was the right ratchet
- The search-analysis cluster already routed BI/reporting build-out to `looker-studio-bigquery`, but the skill itself was still a thin legacy command dump with no support files or eval harness.
- Survey evidence showed a durable workflow pattern: teams do the heavy logic in BigQuery, keep Looker Studio thin, and use the skill mainly for dashboard structure, refresh/cost decisions, audience routing, and stakeholder delivery.
- The lane did not justify a new wrapper because the missing surface was **better trigger clarity and support coverage**, not a missing concept.

## Accepted changes
- Rewrote `looker-studio-bigquery` as a mode-selecting dashboard/reporting skill.
- Added `references/modes-and-routing.md`, `references/modeling-refresh-and-cost.md`, and `references/dashboard-delivery-checklist.md`.
- Added `evals/evals.json`, refreshed `SKILL.toon`, and updated README / README.ko / setup prompt / shipped manifests.
- Preserved the lane boundary against `data-analysis`, `pattern-detection`, `monitoring-observability`, and survey-first BI platform comparison.

## Rejected changes
- Adding another generic BI / dashboard / semantic-layer wrapper
- Merging the skill into `data-analysis`
- Leaving the lane as a generic Looker Studio feature tour with no refresh/cost routing or audience split guidance

## Durable takeaway
In this repo, the BigQuery reporting lane should stay split this way:
- dashboard/reporting build-out on curated BigQuery data → `looker-studio-bigquery`
- KPI explanation and dataset reasoning → `data-analysis`
- repeated anomaly/rule hunting → `pattern-detection`
- telemetry/alerting/instrumentation coverage → `monitoring-observability`

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[data-analysis-modernization-2026-04-14]]
- [[pattern-detection-modernization-2026-04-14]]
- [[monitoring-observability-modernization-2026-04-14]]
