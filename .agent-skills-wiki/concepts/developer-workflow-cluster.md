---
title: Developer Workflow Cluster
created: 2026-04-13
updated: 2026-04-13
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [.survey/workflow-automation-modernization-20260413/context.md, .survey/workflow-automation-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Developer Workflow Cluster

## Durable finding
The developer-workflow lane is cleaner when repo-scoped recurring workflow glue and local Git collaboration are treated as separate anchors instead of both being described as generic "workflow" skills.

Current cluster shape:
- `workflow-automation` = recurring repo glue: task runners, bootstrap entrypoints, local-CI parity, hook guardrails, and maintenance routines
- `git-workflow` = local collaboration and recovery: branch hygiene, commit shaping, sync, conflict handling, push safety, and rescue patterns
- `system-environment-setup` = broader runnable-environment design when toolchains, services, or devcontainers are the real problem
- `deployment-automation` = hosted delivery and rollout automation once the workflow stops being repo-local

## Why it matters
- Trigger precision improves when command orchestration is not collapsed into Git mechanics, environment provisioning, or deployment architecture.
- Repo users need one clear answer for "how do I make this repeatable?" that does not secretly expand into the whole platform stack.
- Discovery docs are enough to steer activation, but only if the utility-layer one-line descriptions state the boundary clearly.

## Boundary rules
- If the question is **"how do we make recurring repo commands repeatable?"** → `workflow-automation`
- If the question is **"how do we shape, sync, or recover local Git history?"** → `git-workflow`
- If the question is **"how do we make this repo runnable across machines/services/containers?"** → `system-environment-setup`
- If the question is **"how do we deploy or automate hosted CI/CD rollout?"** → `deployment-automation`

## Structural note
The graph refresh after the `workflow-automation` modernization reinforced the same repo pattern seen in other clusters: upgrading an indexed legacy anchor with support files is more valuable than adding another overlapping wrapper skill in the utilities/developer-workflow lane.

## Related pages
- [[skill-support-coverage]]
- [[git-workflow-modernization-2026-04-12]]
- [[workflow-automation-modernization-2026-04-13]]
- [[environment-skill-canonicalization-2026-04-12]]
