---
title: Vercel Deploy Modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/vercel-deploy-modernization-20260415/triage.md, .survey/vercel-deploy-modernization-20260415/context.md, .survey/vercel-deploy-modernization-20260415/solutions.md, .agent-skills/vercel-deploy/SKILL.md]
---

# Vercel Deploy Modernization — 2026-04-15

## Decision
The best bounded infrastructure improvement was **rewriting `vercel-deploy` into the repo’s Vercel-specific operations anchor** instead of leaving it as a claimable anonymous deploy shortcut or adding another Vercel-adjacent wrapper.

## Why this was chosen
- `deployment-automation` already routes provider-specific Vercel work away from the generic release-execution lane, so the best move was upgrading the weak provider anchor rather than inventing a new skill.
- The old skill centered on a custom no-auth tarball deploy helper and missed current Vercel workflows around linked projects, preview vs production environments, aliases/domains, promotion, and rollback.
- Survey evidence showed recurring operator reality around env scoping, stable preview URLs, and promotion/rollback verification that belongs inside a Vercel-specific skill.

## What changed
- Rewrote `vercel-deploy` around six modes:
  - preview deploy
  - production deploy
  - preview promotion
  - alias/domain operations
  - env sync / troubleshooting
  - rollback response
- Added support bundle:
  - `references/modes-and-boundaries.md`
  - `references/preview-production-command-packets.md`
  - `references/env-domain-rollback-troubleshooting.md`
  - `evals/evals.json`
- Updated discovery surfaces:
  - `README.md`
  - `README.ko.md`
  - `setup-all-skills-prompt.md`
  - `.agent-skills/skills.json`

## Boundary outcome
The rewrite clarifies adjacent skills instead of competing with them:
- `deployment-automation` = generic rollout strategy and cross-provider release planning
- `workflow-automation` = CI/YAML/task-runner authoring around deploys
- `system-environment-setup` = CLI/install/auth/bootstrap work
- `vercel-deploy` = Vercel-specific preview/prod/env/domain/rollback operations

## Rejected changes
- Adding another Vercel wrapper or alias-only/domain-only helper
- Keeping the skill framed as "no auth required" claimable deploy automation
- Letting the provider skill absorb generic release strategy or CI authoring

## Durable finding
Vercel is not a one-command hosting shortcut anymore in repo-skill terms. The reusable abstraction is **provider-specific deployment operations after vendor choice is already made**: linked-project state, environment scope, preview verification, stable URL handling, and rollback caveats.

## Related pages
- [[skill-support-coverage]]
- [[developer-workflow-cluster]]
- [[deployment-automation-modernization-2026-04-13]]
- [[monitoring-observability-modernization-2026-04-14]]
