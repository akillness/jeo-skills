---
title: npm-git-install modernization
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/npm-git-install-modernization-20260415/context.md, .survey/npm-git-install-modernization-20260415/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# npm-git-install modernization

## Why this was the right bounded target
The highest-value utility/developer-workflow gap was not adding another package-management helper. It was modernizing `npm-git-install`, a stale npm-only command dump that lacked support files, evals, and any decision layer for when direct Git install is the wrong tool. Survey work showed a durable workflow reality: Git-based package installs are mostly a bridge for unpublished fixes, forks, private repos, and monorepo edge cases, while long-lived team/CI/production usage usually wants SHA pins, tarballs, workspaces, or registry publication.

## Accepted changes
- Rewrote `npm-git-install` into a **decision-first package-delivery skill** that chooses one mode: direct Git, SHA-pinned Git, private Git auth, tarball / `npm pack`, workspace / `file:`, or publish-first / private registry.
- Added `references/delivery-decision-matrix.md`, `references/package-manager-behavior.md`, and `references/private-auth-and-ci.md` so the skill keeps durable guidance about package-manager differences, auth/CI parity, and exit strategies.
- Added `evals/evals.json` covering unpublished upstream fixes, private Git CI auth, and monorepo/workspace confusion.
- Updated `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `skills.json` so discovery surfaces describe the sharper role instead of the old GitHub-only wording.
- Refreshed `graphify-out/` after the change so support-coverage and developer-workflow structure reflect the new utility boundary.

## Rejected changes
- Adding a second overlapping install-from-Git wrapper skill.
- Keeping the old branch/tag/commit command dump as the main interface.
- Pretending direct Git install is the default long-term answer for private or shared dependencies.
- Expanding the skill into local Git history repair (`git-workflow`) or repo automation (`workflow-automation`).

## Durable boundary
- `npm-git-install` owns **package delivery choice** for Node ecosystems.
- `git-workflow` owns **local branch/history mechanics**.
- `workflow-automation` owns **repo-local repeatable command glue**.
- `github-repo-management` owns **repo/package/release administration**.
- `system-environment-setup` owns **broader machine/service/runtime setup** when the problem is bigger than one dependency delivery path.

## Key insight
The reusable improvement is not more syntax. It is teaching agents to decide whether a dependency should stay a Git ref at all, and to make auth, lifecycle/build behavior, reproducibility, and exit strategy explicit before turning a temporary bridge into permanent infrastructure.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[git-workflow-modernization-2026-04-12]]
- [[workflow-automation-modernization-2026-04-13]]
