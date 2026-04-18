---
title: Search Analysis Cluster
created: 2026-04-14
updated: 2026-04-15
type: concept
tags: [skills, search-analysis, trigger-design, skill-quality, graphify]
sources: [.survey/codebase-search-modernization-20260414/context.md, .survey/codebase-search-modernization-20260414/solutions.md, .agent-skills/codebase-search/SKILL.md]
---

# Search Analysis Cluster

## Durable finding
The search-analysis lane works best when each skill owns a different stage of the discovery loop:
- `codebase-search` = repo navigation, call-site tracing, entry-point/config hunting, and impact mapping before edits
- `log-analysis` = signal extraction and root-cause-oriented triage from logs
- `data-analysis` = decision-first dataset reasoning across exports, experiments, KPI drops, cohort/funnel work, and telemetry summaries rather than source-code navigation or BI build-out
- `pattern-detection` = mode-selecting repeated pattern/rule/anomaly hunting across code, logs/events, telemetry, and metrics, with confidence labels and explicit route-outs instead of a regex-heavy catch-all
- `looker-studio-bigquery` = BigQuery-backed stakeholder dashboard/reporting build-out, including dashboard structure, refresh/cost strategy, audience routing, and last-mile delivery on top of curated warehouse data

## Boundary that matters
`codebase-search` should stay discovery-first.
It becomes weak when it tries to absorb:
- root-cause diagnosis (`debugging`)
- log triage (`log-analysis`)
- structural cleanup (`code-refactoring`)
- persistent architecture graphing (`graphify`)

## Structural note
`codebase-search` is README-visible and referenced by `code-refactoring`, so weak trigger wording in this skill creates spillover across the code-quality and search-analysis clusters.

## Recommended maintenance direction
- Keep `codebase-search` as the repo-navigation anchor.
- Harden `codebase-search` around packet choice: exact-text, symbol/indexed, structural, config/content, hosted search, or graph/path trace.
- Keep `data-analysis` as the dataset-reasoning anchor; route repeated anomaly work to `pattern-detection` and BI/reporting build-out to `looker-studio-bigquery`.
- Keep `pattern-detection` focused on mode selection, confidence labeling, and repeatable rule/anomaly hunting; route root-cause forensics to `log-analysis` and remediation/reporting to adjacent specialist skills.
- Keep `looker-studio-bigquery` focused on thin dashboards over curated BigQuery data; route KPI explanation back to `data-analysis`, telemetry/alerting coverage to `monitoring-observability`, and stack-choice comparisons to `survey`.
- Prefer support bundles that teach search-mode choice, config/content ownership, and evidence-map output instead of giant command catalogs.
- Re-check discovery wording in README/setup surfaces whenever `codebase-search`, `data-analysis`, `pattern-detection`, or `looker-studio-bigquery` is materially repositioned.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[code-refactoring-modernization-2026-04-14]]
- [[log-analysis-modernization-2026-04-13]]
- [[codebase-search-modernization-2026-04-14]]
- [[pattern-detection-modernization-2026-04-14]]
- [[looker-studio-bigquery-modernization-2026-04-15]]
