---
title: Pattern Detection Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, search-analysis, trigger-design, skill-quality, graphify]
sources: [.survey/pattern-detection-structural-hardening-20260419/context.md, .survey/pattern-detection-structural-hardening-20260419/solutions.md, .agent-skills/pattern-detection/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Pattern Detection Structural Hardening 2026-04-19

## Question
What was the best bounded next improvement for `pattern-detection` after the surrounding search-analysis skills were hardened into routing-first front doors?

## Answer
Tighten `pattern-detection` into a routing-first packet selector instead of adding another anomaly, search, or observability wrapper.

## Why this won
- Survey evidence showed practitioners still start with cheap first passes, then switch tools once the work becomes diagnosis, reporting, or alert operations.
- The skill already had support docs and evals, so the highest-value follow-up was **front-door compression + discovery-surface sync**, not more folder coverage.
- Compact surfaces were stale: `SKILL.toon` and `.agent-skills/skills.toon` still advertised generic trend detection rather than packet-first routing.

## Accepted change
- Rewrite `pattern-detection` around one primary packet: `text-prefilter`, `structural-code-rule`, `log-event-pattern`, or `metric-anomaly`.
- Add `references/intake-packets-and-route-outs.md` so the front door can stay smaller.
- Expand eval coverage with an alert-noise vs analysis route-out case.
- Refresh `SKILL.toon`, `skills.json`, `skills.toon`, README, README.ko, and setup prompt so discovery wording matches the hardened boundary.
- Refresh graph outputs so the structural memory layer records the tighter packet-first role.

## Rejected alternatives
- Add another anomaly-detection wrapper.
- Expand `pattern-detection` into full KPI explanation, root-cause log triage, or security remediation.
- Leave stale compact/discovery wording in place after the rewrite.

## Durable takeaway
`pattern-detection` is strongest as the vendor-neutral first pass for repeated shapes and suspicious windows. Once the user needs the incident story, business explanation, remediation plan, or alert policy, another lane should own the work.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[pattern-detection-modernization-2026-04-14]]
- [[log-analysis-structural-hardening-2026-04-19]]
- [[langsmith-structural-hardening-2026-04-19]]
