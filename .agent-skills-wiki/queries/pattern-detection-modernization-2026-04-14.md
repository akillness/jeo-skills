---
title: Pattern Detection Modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, search-analysis, trigger-design, skill-quality]
sources: [.survey/pattern-detection-modernization-20260414/context.md, .survey/pattern-detection-modernization-20260414/solutions.md, .agent-skills/pattern-detection/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Pattern Detection Modernization 2026-04-14

## Question
What was the highest-value bounded next improvement in the search-analysis lane after modernizing `codebase-search`, `log-analysis`, and `data-analysis`?

## Answer
Modernize `pattern-detection` in place rather than add another search, anomaly, or security-adjacent wrapper.

## Why this won
- The legacy skill was still a grep/regex-heavy catch-all with no `references/` or `evals/`.
- Recent neighboring upgrades made the missing boundary explicit:
  - `codebase-search` now owns repo navigation and impact tracing.
  - `log-analysis` now owns root-cause log triage.
  - `data-analysis` now owns decision-ready dataset explanation.
- Survey evidence showed that real-world pattern work splits by mode: text prefilter, structural code rules, log/event grouping, or metric anomaly checks. The skill needed to teach mode selection and handoff, not another long catalog of commands.

## Accepted change
- Rewrite `pattern-detection` as a mode-selecting pattern/rule/anomaly hunting skill.
- Add `references/` covering detection modes plus confidence / false-positive labeling.
- Add `evals/evals.json` that test code-pattern, KPI anomaly, and gameplay telemetry prompts.
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces reflect the sharper role.
- Refresh graph artifacts and wiki notes so the new boundary is durable across later runs.

## Rejected alternatives
- Add another anomaly-detection or observability wrapper.
- Fold root-cause investigation into the same skill.
- Treat pattern detection as full business analysis or a full security remediation workflow.

## Durable takeaway
The repo gets more leverage when `pattern-detection` acts as the repeatable detection-and-triage bridge across code, logs/events, and metrics, while adjacent specialist skills own diagnosis, explanation, remediation, and dashboard/report deliverables.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[codebase-search-modernization-2026-04-14]]
- [[data-analysis-modernization-2026-04-14]]
- [[log-analysis-modernization-2026-04-13]]
