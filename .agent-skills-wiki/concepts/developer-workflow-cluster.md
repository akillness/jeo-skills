---
title: Developer Workflow Cluster
created: 2026-04-13
updated: 2026-04-15
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [.survey/workflow-automation-modernization-20260413/context.md, .survey/workflow-automation-modernization-20260413/solutions.md, .survey/npm-git-install-modernization-20260415/context.md, .survey/npm-git-install-modernization-20260415/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Developer Workflow Cluster

## Durable finding
The developer-workflow lane is cleaner when repo-scoped recurring workflow glue and local Git collaboration are treated as separate anchors instead of both being described as generic "workflow" skills.

Current cluster shape:
- `file-organization` = repository-shape choice and incremental reorg guidance: framework defaults vs feature/domain grouping vs monorepo boundaries vs docs taxonomy vs engine-aware game/content layouts
- `workflow-automation` = recurring repo glue: task runners, bootstrap entrypoints, local-CI parity, hook guardrails, and maintenance routines
- `git-workflow` = local collaboration and recovery: branch hygiene, commit shaping, sync, conflict handling, push safety, and rescue patterns
- `git-submodule` = external-repo boundary choice and operator flow: submodule-vs-subtree/vendor choice, recursive bootstrap, pointer updates, detached-HEAD handling, removal, and CI checkout/auth
- `npm-git-install` = Git-based package delivery choice: decide between Git refs, SHA pins, private auth, tarballs, workspace/file links, and publish-first registry paths
- `system-environment-setup` = broader runnable-environment design when toolchains, services, or devcontainers are the real problem
- `deployment-automation` = hosted delivery and rollout automation once the workflow stops being repo-local

## Why it matters
- Trigger precision improves when command orchestration is not collapsed into Git mechanics, environment provisioning, or deployment architecture.
- Repo users need one clear answer for "how do I make this repeatable?" that does not secretly expand into the whole platform stack.
- Discovery docs are enough to steer activation, but only if the utility-layer one-line descriptions state the boundary clearly.

## Boundary rules
- If the question is **"how should this repo be structured next: framework defaults, feature/domain folders, monorepo boundaries, docs taxonomy, or engine-aware game/content layout?"** → `file-organization`
- If the question is **"how do we make recurring repo commands repeatable?"** → `workflow-automation`
- If the question is **"how do we shape, sync, or recover local Git history?"** → `git-workflow`
- If the question is **"how should we embed or update another repository inside this repo: submodule, subtree, vendor copy, recursive bootstrap, or CI checkout?"** → `git-submodule`
- If the question is **"how should we consume this Node package: Git ref, tarball, workspace, or publish-first?"** → `npm-git-install`
- If the question is **"how do we make this repo runnable across machines/services/containers?"** → `system-environment-setup`
- If the question is **"how do we deploy or automate hosted CI/CD rollout?"** → `deployment-automation`

## Structural note
The graph refresh after the `npm-git-install` modernization reinforced the same repo pattern seen in other clusters: upgrading an indexed legacy anchor with support files and a clearer boundary is more valuable than adding another overlapping wrapper skill in the utilities/developer-workflow lane.

## Related pages
- [[skill-support-coverage]]
- [[git-workflow-modernization-2026-04-12]]
- [[npm-git-install-modernization-2026-04-15]]
- [[workflow-automation-modernization-2026-04-13]]
- [[environment-skill-canonicalization-2026-04-12]]
