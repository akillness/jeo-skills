# Context: deployment-automation structural hardening

## Workflow Context
This lane appears when the system can already build and the real question is how to release safely: preview deploys, staging-to-production promotion, rollout strategy choice, verification depth, rollback planning, and provider handoff.

The repo already made the boundary decision in 2026-04-13: `deployment-automation` owns release execution, while adjacent skills own CI authoring, machine/runtime setup, telemetry architecture, provider-specific Vercel operations, and security governance. The remaining problem is structural, not conceptual. The current `deployment-automation/SKILL.md` is still 408 lines and includes large embedded packet templates and strategy detail that make the front door read like a manual instead of a router.

Cross-domain scan for this run:

| Domain | Representative skill | Current state | Why not the best target now |
|------|----------------|-------------|------------------------------|
| CLI / developer workflow | `file-organization` | large, but already structurally closer to current repo pattern | Lower urgency than the larger release-execution anchor |
| Web / fullstack | `deployment-automation` | 408-line front door; already canonical but still oversized | **Chosen**: highest-value bounded structural cleanup in the live infrastructure lane |
| Product / ops | `sprint-retrospective` | large, but lower repo-wide leverage than release routing | Better saved for a later PM-focused pass |
| Marketing / GTM | `marketing-automation` | supported and not structurally drifting | Lower urgency this hour |
| Game development | `game-performance-profiler` | rich support already present | Lower structural urgency than deployment routing |

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack developer | Prepare preview, staging, and production release packets | Intermediate |
| Platform / DevOps engineer | Define rollout strategy, verification, rollback, and promotion gates | Advanced |
| Agent maintaining reusable skills | Route deployment requests cleanly without drifting into CI, setup, observability, or provider-specific manuals | Advanced |
| Product / release owner | Understand what a preview or promotion proves before sign-off | Intermediate |

## Current Workarounds
1. Read the oversized `SKILL.md` sequentially and extract the relevant mode packet manually.
2. Reconstruct the actual boundary from older wiki notes or adjacent skills rather than from a small front door.
3. Treat the built-in packet templates as if they belong in the main skill, even though newer repo patterns move those into focused references.
4. Re-explain preview vs promotion vs rollback on every run because the compact discovery surface still reflects the old command-heavy/manual-heavy style.

## Adjacent Problems
- Release execution can drift back into CI authoring unless route-outs to `workflow-automation` stay explicit.
- Preview-release guidance overlaps with provider-specific detail unless the skill routes deep Vercel behavior to `vercel-deploy`.
- Rollout strategy advice becomes too abstract if it is not grounded in primary-source patterns like declarative rollouts, rollback revisions, and progressive delivery.
- The graph now shows complete support coverage across the repo, so the next wins come from shrinking dense anchors and syncing compact surfaces rather than adding more skills.

## User Voices
> "A _Deployment_ provides declarative updates for Pods and ReplicaSets." — Kubernetes Deployments docs (GitHub raw primary-source retrieval)  
> Source: https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/concepts/workloads/controllers/deployment.md

> "Argo Rollouts is a Kubernetes controller and set of CRDs which provide advanced deployment capabilities such as blue-green, canary, canary analysis, experimentation, and progressive delivery features to Kubernetes." — Argo Rollouts README (GitHub raw primary-source retrieval)  
> Source: https://raw.githubusercontent.com/argoproj/argo-rollouts/master/README.md

> "Plan and execute hosted deployment and rollout automation for web, backend, and fullstack systems..." — current repo skill front door  
> Source: `.agent-skills/deployment-automation/SKILL.md`

> Vercel’s deployments docs surface separate preview, promotion, rollback, and sharing flows under the deployment navigation, which matches the repo’s repeated preview/promotion/rollback packet split. — browser/title-and-navigation retrieval  
> Source: https://vercel.com/docs/deployments/preview-deployments
