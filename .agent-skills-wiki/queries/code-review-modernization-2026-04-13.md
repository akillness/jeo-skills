---
title: Code Review Modernization
date: 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/code-review-modernization-20260413/context.md, .survey/code-review-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/git-workflow/references/collaboration-boundaries.md]
---

# Code Review Modernization

## Question
What is the best bounded improvement for the repo's legacy `code-review` skill: add a new review-adjacent skill, or modernize `code-review` into a workflow-aware review anchor?

## Answer
Modernize `code-review`.

A new adjacent wrapper would create more activation noise in a lane that already touches `git-workflow`, `debugging`, `testing-strategies`, `web-design-guidelines`, and hosted PR/repo workflows. The stronger move is to keep one clear review anchor and rewrite it around modern review reality:
- review surfaces are PRs / diffs / patch stacks, not abstract clean-code essays
- the highest-value work is judging correctness, risk, and missing evidence
- route-outs matter because Git cleanup, debugging, testing-policy design, and UI governance are neighboring jobs, not sub-steps of every review

## Why this won
1. The legacy skill was a broad static checklist with weak trigger quality and no support files.
2. The repo already had a boundary statement from `git-workflow` saying commit hygiene is not the same as review judgment.
3. Survey evidence showed real review practice depends on approvals, code ownership, required checks, previews, and explicit reviewer decisions more than on generic SOLID/performance bullet lists.
4. The graph-backed maintenance pattern still favors upgrading high-traffic anchors instead of adding overlapping wrappers.

## Accepted changes
- Rewrite `code-review` as a workflow-aware review skill
- Add `references/review-modes.md`
- Add `references/handoff-boundaries.md`
- Add `evals/evals.json`
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces reflect the sharper role

## Rejected changes
- Adding another generic PR-review or secure-review wrapper in the same lane
- Letting `code-review` absorb Git mechanics, debugging, testing strategy, or pure UI-governance work
- Keeping the legacy checklist structure and only tweaking a few bullets

## Durable findings
- Review skills improve most when they classify the review surface first and use severity + route-out framing.
- Missing evidence is often as important as a concrete bug in modern review workflows.
- Frontend and game review need explicit notes about when the diff is insufficient and additional artifacts or validation are required.

## Related pages
- [[skill-support-coverage]]
- [[git-workflow-modernization-2026-04-12]]
- [[debugging-modernization-2026-04-13]]
- [[backend-testing-modernization-2026-04-12]]
