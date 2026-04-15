---
title: Git Submodule Modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, consolidation, trigger-design, skill-quality]
sources: [.survey/git-submodule-modernization-20260415/context.md, .survey/git-submodule-modernization-20260415/solutions.md, .agent-skills/git-submodule/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Git Submodule Modernization 2026-04-15

## Decision
The best bounded utilities/developer-workflow improvement was modernizing `git-submodule` into the repo's **external-repo boundary and operator-flow anchor** instead of adding another Git dependency wrapper or leaving it as a giant command tutorial.

## Why this beat other options
- The existing skill was still a legacy command catalog with no `references/` and no `evals/`, despite covering a high-friction workflow.
- The developer-workflow cluster already had cleaner anchors for local Git history (`git-workflow`) and Git-based Node package delivery (`npm-git-install`), so the remaining value was clarifying the separate submodule boundary.
- Primary-source evidence from Git, Atlassian, and GitHub Actions consistently pointed to the same pain points: `.gitmodules` as contract, detached `HEAD`, branch tracking for `update --remote`, and explicit CI checkout/auth.

## Accepted changes
- Rewrite `git-submodule` as a decision-first skill that:
  - chooses whether submodule is the right tool before emitting commands,
  - selects one workflow mode,
  - makes detached-HEAD / pointer / CI consequences explicit,
  - routes generic history cleanup to `git-workflow` and package delivery to `npm-git-install`.
- Add support files:
  - `references/decision-matrix.md`
  - `references/update-and-detached-head.md`
  - `references/ci-and-automation.md`
  - `evals/evals.json`
- Update discovery/setup surfaces so the repo no longer describes `git-submodule` as generic management.

## Rejected changes
- Adding another Git dependency wrapper for subtree/vendor/package choices
- Letting `git-submodule` absorb generic rebase/merge/recovery flows already owned by `git-workflow`
- Treating package-manager artifact delivery as part of the submodule skill instead of routing to `npm-git-install`

## Durable takeaway
The practical value of `git-submodule` is not remembering every command. It is choosing between **boundary decision**, **bootstrap**, **pinned sync**, **pointer advance**, **inside-submodule editing**, **removal**, and **CI checkout**, while making the consequences of each mode visible before the user lands in detached `HEAD` or a broken CI clone.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[git-workflow-modernization-2026-04-12]]
- [[npm-git-install-modernization-2026-04-15]]
