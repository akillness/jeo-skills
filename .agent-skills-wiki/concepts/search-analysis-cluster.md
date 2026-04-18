---
title: Search Analysis Cluster
created: 2026-04-14
updated: 2026-04-19
type: concept
tags: [skills, search-analysis, trigger-design, skill-quality, graphify]
sources: [.survey/codebase-search-modernization-20260414/context.md, .survey/codebase-search-modernization-20260414/solutions.md, .survey/looker-studio-bigquery-structural-hardening-20260419/context.md, .survey/looker-studio-bigquery-structural-hardening-20260419/solutions.md, .survey/log-analysis-structural-hardening-20260419/context.md, .survey/log-analysis-structural-hardening-20260419/solutions.md, .survey/langsmith-structural-hardening-20260419/context.md, .survey/langsmith-structural-hardening-20260419/solutions.md, .agent-skills/codebase-search/SKILL.md, .agent-skills/log-analysis/SKILL.md, .agent-skills/looker-studio-bigquery/SKILL.md, .agent-skills/langsmith/SKILL.md]
---

# Search Analysis Cluster

## Durable finding
The search-analysis lane works best when each skill owns a different stage of the discovery loop:
- `codebase-search` = repo navigation, call-site tracing, entry-point/config hunting, and impact mapping before edits
- `log-analysis` = routing-first log triage that chooses one evidence packet (`app-runtime`, `container-runtime`, `browser-plus-api`, `ci-cascade`, `structured-json`, or `security-signal`) and isolates the first actionable blocker before routing to downstream skills
- `data-analysis` = decision-first dataset reasoning across exports, experiments, KPI drops, cohort/funnel work, and telemetry summaries rather than source-code navigation or BI build-out
- `pattern-detection` = mode-selecting repeated pattern/rule/anomaly hunting across code, logs/events, telemetry, and metrics, with confidence labels and explicit route-outs instead of a regex-heavy catch-all
- `looker-studio-bigquery` = packet-first BigQuery stakeholder dashboard delivery, including `dashboard-spec`, `slow-dashboard`, `refresh-shape`, `audience-split`, and `exec-handoff` work on top of curated warehouse data
- `langsmith` = LangSmith-specific packet selection across `trace-debug`, `eval`, `review`, `prompt-registry`, `propagation`, and `audit`, with hard route-outs to generic observability, debugging, deployment, and analytics skills

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
- Keep `log-analysis` focused on packet choice plus first-blocker isolation; route debugging hypotheses to `debugging`, repeated anomaly hunting to `pattern-detection`, observability design to `monitoring-observability`, and Unity/Unreal logs to `game-build-log-triage`.
- Keep `pattern-detection` focused on mode selection, confidence labeling, and repeatable rule/anomaly hunting; route root-cause forensics to `log-analysis` and remediation/reporting to adjacent specialist skills.
- Keep `looker-studio-bigquery` focused on thin dashboards over curated BigQuery data; start from one intake packet, keep exec-handoff separate from KPI interpretation, and route KPI explanation back to `data-analysis`, telemetry/alerting coverage to `monitoring-observability`, and stack-choice comparisons to `survey`.
- Keep `langsmith` narrow: choose the LangSmith packet first, keep SDK specifics in references, and route generic telemetry, bug forensics, rollout work, and KPI interpretation out immediately.
- Prefer support bundles that teach search-mode choice, packet choice, config/content ownership, and evidence-map output instead of giant command catalogs.
- Re-check discovery wording in README/setup surfaces whenever `codebase-search`, `log-analysis`, `data-analysis`, `pattern-detection`, `looker-studio-bigquery`, or `langsmith` is materially repositioned.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[code-refactoring-modernization-2026-04-14]]
- [[log-analysis-modernization-2026-04-13]]
- [[log-analysis-structural-hardening-2026-04-19]]
- [[codebase-search-modernization-2026-04-14]]
- [[pattern-detection-modernization-2026-04-14]]
- [[looker-studio-bigquery-modernization-2026-04-15]]
- [[looker-studio-bigquery-structural-hardening-2026-04-19]]
- [[langsmith-structural-hardening-2026-04-19]]
