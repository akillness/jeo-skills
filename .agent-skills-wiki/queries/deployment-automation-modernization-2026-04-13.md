---
title: Deployment Automation Modernization 2026-04-13
created: 2026-04-13
updated: 2026-04-13
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/deployment-automation-modernization-20260413/triage.md, .survey/deployment-automation-modernization-20260413/context.md, .survey/deployment-automation-modernization-20260413/solutions.md, .survey/deployment-automation-modernization-20260413/platform-map.md, .survey/deployment-automation-modernization-20260413/loop-charter.md, graphify-out/GRAPH_REPORT.md]
---

# Deployment Automation Modernization 2026-04-13

## Question
What is the best bounded next modernization target in the developer-workflow / infrastructure lane after `workflow-automation`, given the need to improve release leverage without adding another overlapping deployment wrapper?

## Decision
Modernize `deployment-automation` into the release-execution anchor for preview/staging/prod promotion, rollout strategy, post-deploy verification, and rollback planning instead of adding another CI/CD or provider-specific wrapper.

## Why this won
- The broad repository scan still showed `deployment-automation` as a highly visible legacy anchor lacking both `references/` and `evals/`.
- The developer-workflow cluster already had sharper boundaries for repo-local automation, local Git workflow, and runnable-machine setup, so the next clean gap was hosted delivery and rollout execution.
- Survey findings reinforced that the durable problem is not generic “CI/CD”; it is release execution: promotion, approvals, verification, rollback, and environment-specific handoff.
- The legacy skill was a long Docker/Kubernetes/cloud example dump with weak trigger wording and weak route-outs, so modernization produced more leverage than inventing another deployment wrapper.

## Accepted changes
- Rewrite `deployment-automation` as a workflow-first release-execution skill.
- Add `references/` for mode selection, rollout/rollback checklisting, and platform routing.
- Add `evals/evals.json` covering preview release, environment promotion, and rollback response.
- Update README / README.ko / setup prompt / `skills.json` so discovery surfaces describe the sharper role.
- Refresh graphify outputs and wiki notes so future runs see the updated infrastructure boundary clearly.

## Rejected alternatives
- Adding another generic CI/CD or rollout wrapper.
- Letting `deployment-automation` absorb CI workflow authoring better owned by `workflow-automation`.
- Letting the skill absorb machine/runtime setup better owned by `system-environment-setup`.
- Letting the skill absorb long-lived telemetry architecture better owned by `monitoring-observability`.
- Treating Vercel-specific operations as part of the generic deployment anchor.

## Durable takeaway
The infrastructure lane is easier to maintain when `deployment-automation` owns release execution and rollout safety, while adjacent skills own CI authoring, machine setup, observability, provider-specific operations, and security governance. The highest-value deployment guidance is a deployment packet with mode, artifact, environments, rollout, verification, rollback, and explicit handoffs.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[workflow-automation-modernization-2026-04-13]]
- [[environment-skill-canonicalization-2026-04-12]]
