---
title: Debugging Modernization 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify]
sources: [.survey/debugging-modernization-20260413/triage.md, .survey/debugging-modernization-20260413/context.md, .survey/debugging-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/debugging/SKILL.md]
---

# Debugging Modernization 2026-04-13

## Decision
Modernize the existing `debugging` skill instead of adding another bug-hunt, troubleshooting, or regression wrapper.

## Why this won
- The old skill was still a generic legacy guide with no `references/` or `evals/` and weak handoff rules.
- Survey evidence converged on the same durable workflow: **reproduce → isolate → hypothesize → verify**, not a bag of debugger commands.
- The repo already had strong adjacent specialists, so the highest-leverage move was boundary clarification:
  - `log-analysis` = symptom-first log triage and first actionable failure
  - `debugging` = root-cause workflow once the suspect boundary is testable
  - `testing-strategies` = broader coverage policy and flaky-test prevention program design
  - `code-review` = preventive diff audit
  - `performance-optimization` = measurement/tuning once the performance problem is framed

## Accepted changes
- Rewrote `debugging` into a systematic reproduce → isolate → hypothesize → verify workflow.
- Added `references/debug-loop.md` and `references/handoff-boundaries.md`.
- Added `evals/evals.json` covering regression debugging, flaky CI investigation, and log-analysis handoff.
- Updated README / README.ko / setup prompt / `skills.json` so discovery surfaces reflect the sharper positioning.
- Refreshed graph outputs so the code-quality cluster shows cleaner neighboring roles.

## Rejected changes
- Adding another generic debugging or bug-investigation skill
- Letting `debugging` absorb raw symptom-first log triage already owned by `log-analysis`
- Letting `debugging` expand into broad testing-program design or PR audit work

## Durable finding
For code-quality skills, the best reusable upgrade is usually **workflow separation plus support bundles**: one skill narrows symptoms, one skill runs the root-cause experiment loop, and neighboring skills pick up prevention or optimization work afterward.

## Related pages
- [[skill-support-coverage]]
- [[log-analysis-modernization-2026-04-13]]
- [[backend-testing-modernization-2026-04-12]]
- [[git-workflow-modernization-2026-04-12]]
