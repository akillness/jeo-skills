---
title: User Guide Writing Modernization (2026-04-13)
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, survey, trigger-design, skill-quality, docs, consolidation]
sources: [.survey/user-guide-writing-modernization-20260413/context.md, .survey/user-guide-writing-modernization-20260413/solutions.md, .agent-skills/user-guide-writing/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# User Guide Writing Modernization (2026-04-13)

## Question
What is the highest-value bounded documentation-cluster improvement after `technical-writing` was modernized?

## Answer
Modernize `user-guide-writing` instead of adding another documentation wrapper.

The survey and graph refresh both pointed to the same gap:
- the repo already had a sharper internal-docs anchor in `technical-writing`
- `user-guide-writing` was still a long example-heavy legacy skill with weak trigger wording and no support files
- the cluster problem was not missing coverage; it was weak separation between internal docs, API docs, user help, and changelog work

## Accepted changes
- Rewrote `user-guide-writing` into a mode-based end-user-docs anchor:
  - `getting-started`
  - `tutorial`
  - `how-to`
  - `faq`
  - `release-help-update`
- Added route-outs to `technical-writing`, `api-documentation`, and `changelog-maintenance`
- Added durable support files for boundaries, workflow checklist, and maintenance signals
- Added `evals/evals.json` to lock in dry-run behavior
- Updated discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`)

## Rejected changes
- Adding a separate help-center or product-education wrapper skill
- Merging `user-guide-writing` into `technical-writing`
- Treating changelog work or API portal work as part of the same user-doc skill

## Why this should transfer
The improvement is structural, not repo-specific. Most product teams still mix onboarding guides, tutorials, FAQs, and stale-doc refreshes in one blob. The new skill introduces a reusable mode split plus maintenance heuristics that should help future agents choose the right user-doc shape quickly.

## Related pages
- [[documentation-cluster]]
- [[skill-support-coverage]]
- [[technical-writing-modernization-2026-04-13]]
