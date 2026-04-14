---
title: Monitoring Observability Modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, docs]
sources: [.survey/monitoring-observability-modernization-20260414/triage.md, .survey/monitoring-observability-modernization-20260414/context.md, .survey/monitoring-observability-modernization-20260414/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Monitoring Observability Modernization — 2026-04-14

## Decision
The best bounded infrastructure improvement was **rewriting `monitoring-observability` as the repo’s telemetry design/review anchor** instead of adding another alerting-only, dashboard-only, or vendor-specific observability wrapper.

## Why this was chosen
- The existing skill was still a legacy example dump with no support bundle, weak trigger boundaries, and no evals.
- The latest graph refresh still showed top-level discovery docs as the highest-degree nodes, so repositioning an existing anchor was more valuable than adding a hidden new skill.
- Survey evidence across service reliability, data observability, and game/live-ops workflows pointed to one reusable pattern: teams need help deciding **which observability mode they are in** before choosing tools.

## What changed
- Rewrote `monitoring-observability` around five modes:
  - service reliability
  - telemetry foundation
  - data / pipeline observability
  - game / live-ops visibility
  - review / gap audit
- Added support bundle:
  - `references/modes-and-boundaries.md`
  - `references/alert-dashboard-checklist.md`
  - `references/telemetry-rollout-matrix.md`
  - `evals/evals.json`
- Updated discovery surfaces:
  - `README.md`
  - `README.ko.md`
  - `setup-all-skills-prompt.md`
  - `.agent-skills/skills.json`

## Boundary outcome
The rewrite makes the neighboring skills cleaner instead of blurrier:
- `log-analysis` = root-cause log forensics once evidence already exists
- `debugging` = code-level reproduce → isolate → verify
- `performance-optimization` = bottleneck diagnosis / tuning after measurements exist
- `langsmith` = LLM-specific tracing / evaluation
- `game-performance-profiler` = Unity/Unreal frame-time and profiler interpretation
- `deployment-automation` = rollout execution, not long-lived telemetry architecture

## Rejected changes
- Adding another generic observability or alerting skill
- Turning the skill into a vendor catalog of Prometheus / Grafana / Datadog snippets
- Folding incident root-cause analysis into the same skill
- Treating data/marketing pipeline reliability as out of scope for observability

## Durable finding
The repo benefits more from **mode-selecting observability guidance plus support files** than from another overlapping infrastructure wrapper. Observability is one of the places where web/backend, PM/ops/marketing data, and game live-ops share a real common abstraction — but only if the skill starts with workflow mode and explicit route-outs.

## Related pages
- [[skill-support-coverage]]
- [[infrastructure-environment-cluster]]
- [[log-analysis-modernization-2026-04-13]]
- [[performance-optimization-modernization-2026-04-14]]
- [[database-schema-design-modernization-2026-04-14]]
