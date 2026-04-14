---
title: Data Analysis Modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality, search-analysis, docs]
sources: [.survey/data-analysis-modernization-20260414/triage.md, .survey/data-analysis-modernization-20260414/context.md, .survey/data-analysis-modernization-20260414/solutions.md, .agent-skills/data-analysis/SKILL.md]
---

# Data Analysis Modernization — 2026-04-14

## Question
What is the highest-value bounded search-analysis improvement after strengthening `codebase-search` and catalog-sync maintenance?

## Answer
Modernize `data-analysis` in place.

Why this clears the bar:
1. It is a high-utility legacy anchor that still looked like a generic pandas/SQL snippet dump.
2. The lane matters across product analytics, marketing ops, developer workflow datasets, and game telemetry.
3. The old skill had no support bundle and weak route-outs to anomaly detection or BI-specific build work.
4. Upgrading the existing anchor adds more value than creating another overlapping analytics wrapper.

## Accepted changes
- Rewrote `data-analysis` into a decision-first dataset-analysis workflow.
- Added support files for lane selection and stakeholder-ready decision briefs.
- Added eval coverage for experiment analysis, marketing + product metrics, gameplay telemetry, and leadership KPI explanation.
- Updated README / README.ko / setup prompt / `skills.json` wording to reflect the sharper role.

## Rejected alternatives
- Add another broad analytics wrapper instead of upgrading `data-analysis`.
- Let `data-analysis` absorb repeated anomaly hunting already better owned by `pattern-detection`.
- Turn the skill into a BI-dashboard or vendor-specific tutorial instead of a reusable reasoning workflow.

## Structural note
This run sharpened the search-analysis boundaries: `data-analysis` now owns dataset reasoning, `pattern-detection` owns repeated anomaly/rule-based scanning, and `looker-studio-bigquery` remains the dashboard/reporting handoff.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[codebase-search-modernization-2026-04-14]]
- [[log-analysis-modernization-2026-04-13]]
