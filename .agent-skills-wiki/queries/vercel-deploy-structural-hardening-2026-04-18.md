---
title: Vercel Deploy Structural Hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/vercel-deploy-structural-hardening-20260418/triage.md, .survey/vercel-deploy-structural-hardening-20260418/context.md, .survey/vercel-deploy-structural-hardening-20260418/solutions.md, .agent-skills/vercel-deploy/SKILL.md, .agent-skills/vercel-deploy/SKILL.toon]
---

# Vercel Deploy Structural Hardening — 2026-04-18

## Decision
The best bounded infrastructure follow-up was **hardening `vercel-deploy` in place** instead of creating another Vercel wrapper. The key fix was to shrink the front door into a cleaner routing-first operator skill and finally sync the stale compact/discovery surface.

## Why this was chosen
- The graph watchlist still flagged `vercel-deploy` as an oversized front door.
- The canonical `SKILL.md` had already been modernized on 2026-04-15, but `SKILL.toon` and `.agent-skills/skills.toon` still described the old claimable tarball flow.
- Survey evidence showed the durable operator abstraction is not “deploy to Vercel” as one action; it is linked-project state + target environment + URL goal + promote/rollback verification.

## What changed
- Shrunk `vercel-deploy/SKILL.md` from 313 lines to 244 lines.
- Reframed the skill around a single `vercel_packet` intake and six operator modes:
  - preview deploy
  - production deploy
  - promote preview
  - alias/domain
  - env sync
  - rollback response
- Updated `references/preview-production-command-packets.md` with a staged production + promote packet and scope/verification reminders.
- Expanded `evals/evals.json` with rollback-response and route-out coverage.
- Synced discovery surfaces:
  - `vercel-deploy/SKILL.toon`
  - `.agent-skills/skills.json`
  - `.agent-skills/skills.toon`
  - `README.md`
  - `README.ko.md`
  - `setup-all-skills-prompt.md`
- Refreshed `graphify-out/` so the structural memory layer records that the stale compact drift is gone.

## Boundary outcome
`vercel-deploy` now stays sharper against adjacent skills:
- `deployment-automation` = provider-neutral rollout strategy and release-policy design
- `workflow-automation` = CI/workflow authoring around deploys
- `system-environment-setup` = CLI/auth/bootstrap and local-machine setup
- `debugging` = app/build failures before deployment operations are trustworthy
- `vercel-deploy` = provider-specific deploy/promote/domain/env/rollback operations after Vercel is already chosen

## Rejected changes
- Adding another Vercel wrapper for domains, promote, or rollback
- Keeping the compact discovery surface on the old no-auth claimable deploy story
- Broadening `vercel-deploy` back into generic deployment strategy or CI authoring

## Durable finding
For provider-specific hosting skills, stale compact variants are not a cosmetic issue. They can silently restore obsolete trigger behavior even after the canonical skill is fixed. Structural hardening should therefore treat `SKILL.toon` / manifest / README/setup sync as part of the acceptance criteria, not as optional polish.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[vercel-deploy-modernization-2026-04-15]]
- [[deployment-automation-modernization-2026-04-13]]
