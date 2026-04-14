---
title: Codebase Search Modernization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, survey, trigger-design, skill-quality, search-analysis, docs]
sources: [.survey/codebase-search-modernization-20260414/triage.md, .survey/codebase-search-modernization-20260414/context.md, .survey/codebase-search-modernization-20260414/solutions.md]
---

# Codebase Search Modernization — 2026-04-14

## Question
What is the highest-value bounded search-analysis improvement after modernizing `log-analysis` and adjacent code-quality anchors?

## Answer
Modernize `codebase-search` in place.

Why this clears the bar:
1. It is still a README/setup-visible legacy anchor.
2. Adjacent skills already depend on it as the route for pure discovery work.
3. The old body is a long command dump without a search-mode decision ladder or evidence-map output.
4. Adding support files and evals improves trigger precision without creating another overlapping search wrapper.

## Accepted changes
- Rewrote `codebase-search` into an evidence-first repo-navigation / impact-mapping skill.
- Added support files for search-mode choice, evidence-map output, and route-out boundaries.
- Added eval coverage for pre-change discovery, call-site tracing, config ownership, and syntax-aware search.
- Updated README / README.ko / setup prompt / `skills.json` wording to reflect the sharper role.

## Rejected alternatives
- Add another repo-search wrapper instead of upgrading the existing anchor.
- Let `codebase-search` absorb diagnosis or refactoring work already owned by other skills.
- Keep the giant command catalog as the primary UX.

## Structural note
This run also reconfirmed that `.agent-skills/skills.json` does not currently match the filesystem skill count. Treat that as a separate maintenance signal rather than silently treating manifest counts as authoritative in graph/wiki summaries.

## Related pages
- [[search-analysis-cluster]]
- [[skill-support-coverage]]
- [[log-analysis-modernization-2026-04-13]]
- [[code-refactoring-modernization-2026-04-14]]
