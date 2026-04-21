---
title: Developer Workflow Cluster
created: 2026-04-13
updated: 2026-04-20
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [.survey/workflow-automation-modernization-20260413/context.md, .survey/workflow-automation-modernization-20260413/solutions.md, .survey/workflow-automation-structural-hardening-20260418/context.md, .survey/workflow-automation-structural-hardening-20260418/solutions.md, .survey/npm-git-install-modernization-20260415/context.md, .survey/npm-git-install-modernization-20260415/solutions.md, .survey/fabric-modernization-20260415/context.md, .survey/fabric-modernization-20260415/solutions.md, .survey/lmstudio-cli-modernization-20260415/context.md, .survey/lmstudio-cli-modernization-20260415/solutions.md, .survey/file-organization-structural-hardening-20260417/context.md, .survey/file-organization-structural-hardening-20260417/solutions.md, .survey/git-workflow-structural-hardening-20260418/context.md, .survey/git-workflow-structural-hardening-20260418/solutions.md, .survey/git-submodule-structural-hardening-20260418/context.md, .survey/git-submodule-structural-hardening-20260418/solutions.md, .survey/clawteam-structural-hardening-20260419/context.md, .survey/clawteam-structural-hardening-20260419/solutions.md, .survey/clawteam-packet-ratchet-20260420/context.md, .survey/clawteam-packet-ratchet-20260420/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Developer Workflow Cluster

## Durable finding
The developer-workflow lane is cleaner when repo-scoped recurring workflow glue and local Git collaboration are treated as separate anchors instead of both being described as generic "workflow" skills.

Current cluster shape:
- `file-organization` = repository-shape choice and incremental reorg guidance: framework defaults vs feature/domain grouping vs monorepo boundaries vs docs taxonomy vs engine-aware game/content layouts
- `workflow-automation` = recurring repo glue: task runners, bootstrap entrypoints, local-CI parity, hook guardrails, and maintenance routines
- `git-workflow` = local collaboration and recovery: branch hygiene, commit shaping, sync, conflict handling, push safety, and rescue patterns
- `git-submodule` = external-repo boundary choice and operator flow: submodule-vs-subtree/vendor/package-delivery choice, recursive bootstrap, pinned-state sync, safe pointer updates, detached-HEAD handling, hosted-platform constraints, removal, and CI checkout/auth
- `npm-git-install` = Git-based package delivery choice: decide between Git refs, SHA pins, private auth, tarballs, workspace/file links, and publish-first registry paths
- `fabric` = reusable pattern-driven CLI transforms over stdin/files/transcripts/notes/logs plus custom-pattern maintenance and optional server mode; not a generic coding assistant or scraping layer
- `lmstudio-cli` = LM Studio operator lane: local `lms` checks, remote endpoint verification, native-management escalation, and downstream OpenAI-compatible wiring for LM Studio specifically
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
- If the question is **"how do I run a reusable named prompt/pattern transform over stdin, files, transcripts, or notes?"** → `fabric`
- If the question is **"how do I verify LM Studio itself, choose between `lms`, `/v1/*`, and native REST calls, or wire another tool to an LM Studio endpoint?"** → `lmstudio-cli`
- If the question is **"how do we make this repo runnable across machines/services/containers?"** → `system-environment-setup`
- If the question is **"how do we deploy or automate hosted CI/CD rollout?"** → `deployment-automation`

## Structural note
The graph refresh after the `npm-git-install`, `fabric`, `lmstudio-cli`, and `file-organization` hardening passes reinforced the same repo pattern seen in other clusters: once support coverage is complete, the higher-value move is shrinking indexed dense anchors into routing-first front doors rather than adding another overlapping wrapper skill in the utilities/developer-workflow lane.

The `file-organization` follow-up matters because it is one of the few developer-workflow skills that also crosses backend, docs, and game-development structure decisions. Keeping the front door small while letting the existing references carry repo-type detail preserves that breadth without turning the skill back into a mini-handbook.

The `git-workflow` structural-hardening pass extended the same rule to the local Git anchor. The lane stays cleaner when `git-workflow` keeps the six local-state modes together but pushes command packets into support docs, because that preserves the existing split between local history work and hosted PR/repo-management work without inventing another Git wrapper.

The `git-submodule` structural-hardening pass applied the same dense-anchor rule to repo-boundary work. Moving mode packets and hosted-platform constraints into a support reference kept the canonical skill boundary intact while making GitHub Pages limits, detached-HEAD invariants, and pointer semantics easier to scan than when they were buried in one giant front door.

The `workflow-automation` structural-hardening pass extended the same pattern to recurring repo glue itself. The lane stays cleaner when `workflow-automation` acts as a routing-first front door for task-entrypoints, bootstrap, local-CI parity, hooks, maintenance bots, and workflow cleanup while leaving machine setup, deploy execution, Git policy, and test-policy questions to neighboring skills.

The 2026-04-19 `npm-git-install` structural-hardening pass applied the same rule to package delivery choice. The lane stays cleaner when `npm-git-install` starts from the delivery packet already in hand—temporary bridge, shared bridge, private-auth, artifact fallback, workspace inner loop, or durable distribution—and routes Git repair, package-host admin, repo glue, and environment setup out immediately instead of keeping a larger syntax-heavy front door.

The 2026-04-19 `clawteam` structural-hardening pass extended the same dense-anchor rule to multi-agent developer tooling. The lane stays cleaner when `clawteam` acts as the ClawTeam-specific operator router—manual team control, template launch, monitoring/recovery, and profile setup—while generic orchestration, planning, and board governance keep routing to their neighboring skills instead of being absorbed into another swarm wrapper.

The 2026-04-20 packet-ratchet pass tightened the same boundary again. The durable lesson is that ClawTeam-style workflows are still operator-heavy: tmux/worktree visibility, runtime caveats, and honest wrong-owner checks matter more than a larger abstraction-first front door. In this lane, the better maintenance move is to expose one operator packet early and route generic orchestration or queue governance outward, not to add another swarm wrapper.

## Related pages
- [[skill-support-coverage]]
- [[file-organization-modernization-2026-04-15]]
- [[file-organization-structural-hardening-2026-04-17]]
- [[git-workflow-modernization-2026-04-12]]
- [[git-workflow-structural-hardening-2026-04-18]]
- [[git-submodule-modernization-2026-04-15]]
- [[git-submodule-structural-hardening-2026-04-18]]
- [[npm-git-install-modernization-2026-04-15]]
- [[npm-git-install-structural-hardening-2026-04-19]]
- [[clawteam-structural-hardening-2026-04-19]]
- [[fabric-modernization-2026-04-15]]
- [[lmstudio-cli-modernization-2026-04-15]]
- [[workflow-automation-modernization-2026-04-13]]
- [[workflow-automation-structural-hardening-2026-04-18]]
- [[environment-skill-canonicalization-2026-04-12]]
