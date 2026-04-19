---
title: npm-git-install structural hardening
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/npm-git-install-structural-hardening-20260419/context.md, .survey/npm-git-install-structural-hardening-20260419/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# npm-git-install structural hardening

## Why this was the right bounded target
The best bounded utility/developer-workflow improvement was not another package-management helper. It was tightening the existing `npm-git-install` skill into the same routing-first shape used by the repo's stronger structural-hardening passes. Survey work this run confirmed the workflow reality across CLI/dev, web/fullstack, product/ops, marketing/content automation, and game-tooling usage: teams already know the syntax exists, but they still need a small front door that chooses one packet and tells them when to stop treating a Git ref like permanent infrastructure.

## Accepted changes
- Rewrote `npm-git-install` into a smaller routing-first front door that starts from one packet shape: temporary bridge, shared bridge, private-auth, artifact fallback, workspace inner loop, or durable distribution.
- Added `references/intake-packets-and-route-outs.md` so packet choice and neighboring-skill boundaries live in support docs instead of a larger front-door wall of prose.
- Expanded `evals/evals.json` with a shared internal tooling case that exercises the durable-distribution boundary across non-web-only usage.
- Synced `SKILL.toon`, `.agent-skills/skills.toon`, `.agent-skills/skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces describe the packet-first role consistently.
- Refreshed `graphify-out/` after the change; `npm-git-install` dropped out of the current oversized-front-door watchlist.

## Rejected changes
- Adding a second package-delivery or Git-install wrapper skill.
- Keeping the previous, more detailed front door just because it already had decent support coverage.
- Treating private-auth friction as a reason to keep raw Git installs forever instead of re-evaluating artifact or publish-first paths.
- Broadening the skill into Git repair, package-host administration, or generic environment setup.

## Durable boundary
- `npm-git-install` owns **Node package delivery choice**.
- `git-workflow` owns **branch/history repair and local Git mechanics**.
- `github-repo-management` owns **repo/package/release administration**.
- `workflow-automation` owns **repo-local automation around the chosen flow**.
- `system-environment-setup` owns **machine/runtime/container setup** when package choice is no longer the main blocker.

## Key insight
The reusable improvement is structural, not topical: once support coverage is already complete, the higher-value move is shrinking the front door so it starts from the packet teams actually have and leaves neighboring ownership obvious. That keeps the skill broadly reusable across web, ops, marketing, and game-tooling repos without turning it back into a generic install syntax catalog.

## Related pages
- [[developer-workflow-cluster]]
- [[npm-git-install-modernization-2026-04-15]]
- [[skill-support-coverage]]
- [[git-workflow-structural-hardening-2026-04-18]]
- [[workflow-automation-structural-hardening-2026-04-18]]
