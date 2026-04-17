# Solution Landscape: vercel-deploy structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Vercel CLI | Direct command-line operator surface for deploy, promote, rollback, alias, env, domains | Most complete scripted/manual surface; works for linked projects, prebuilt flows, and incident response | Requires linked/authenticated project context; env/domain/promote semantics still need operator judgment | Canonical provider-specific control plane |
| Git Integration + GitHub integration | Auto preview/prod deploys from branches/PRs/merges | Default team workflow; strong preview-review UX; automatic prod branch behavior | Less explicit during incidents; some provider/enterprise cases require extra automation | Best happy-path surface, not always the last-mile ops surface |
| Vercel Dashboard | Manual deploy/redeploy, deployment history, env/domain/config controls, instant rollback | Strong UI for low-friction intervention and governance changes | Less scriptable; many exact ops still route back to CLI/docs | Useful complement, not replacement, for CLI |
| Domains + Aliases | Generated URLs, `vercel alias`, custom domains, DNS verification | First-class URL management; stable preview/share URLs; custom domain support | DNS ownership and propagation remain external/manual dependencies | Critical when preview URLs become stakeholder-facing artifacts |
| Env management | `vercel env`, `vercel pull`, dashboard env settings, system env vars | Clear env-scoped model; local sync support; useful for debugging preview/prod drift | Changes apply only to new deployments; branch/custom env nuance remains error-prone | Repeated source of real operator confusion |
| Promotion + Rollback | `vercel promote`, `vercel rollback`, instant rollback, deployment checks | Supports staged release flow and production recovery | Promote/rollback semantics are not trivial; plan/team/domain caveats matter | Belongs in the skill because it is provider-specific operational judgment |
| Deploy Hooks / Checks / API | External trigger and gated-release adjunct surfaces | Good for CMS, cron, external orchestrators, or governance overlays | Support layer only; adds complexity; not the default entry point | Better treated as route-out/support context than the main front door |

## Categories
- **Primary entry points:** Git Integration, Vercel CLI, Dashboard manual deploys
- **URL / traffic surfaces:** generated deployment URLs, aliases, custom domains
- **Configuration / state surfaces:** linking, env vars, system env vars, project settings
- **Release-control surfaces:** preview deploys, production deploys, promotion, rollback, deployment checks
- **Automation adjuncts:** deploy hooks, API-driven deploy triggers, surrounding CI runners
- **JTBD alternatives / indirect substitutes:** Netlify CLI/docs, Cloudflare Pages build/deploy docs, Render deploy docs, Railway deployment guides — all solve “host my web app and manage deploys,” but none replace the need for a Vercel-specific operator skill once the provider is already chosen

Alternative-source notes:
- Netlify CLI docs: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/#deploy-a-site
- Cloudflare Pages docs: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Render deploy docs: https://render.com/docs/deploys
- Railway deployment guides: https://docs.railway.com/guides/deployments

## What People Actually Use
In practice the operator stack is mixed, not singular:
- GitHub/Vercel integration for routine preview deploys and production-on-merge
- CLI deploys during incidents, prebuilt CI flows, explicit production deploys, or staged releases
- Dashboard for manual inspection, redeploy, instant rollback, domain checks, and env review
- Registrar/DNS provider UI plus Vercel dashboard for domains
- Copy-paste deployment packets (URL, branch/commit, promote target, DNS status, env scope, verification status) because deploy output, domain state, and rollback state live across more than one surface

## Frequency Ranking
1. **Vercel CLI workflow** — shows up across deploy/link/build/promote/env/alias/rollback docs and real-world issue threads most often
2. **Git integration / GitHub preview workflow** — primary happy-path release model for teams
3. **Domain / alias operations** — common whenever preview URLs must become stable or production-facing
4. **Env management** — persistent source of troubleshooting and repeated re-sync work
5. **Promotion / rollback controls** — critical for safe release and incident response, but semantics are easy to misunderstand
6. **Deploy hooks / checks / external automation** — useful support surfaces, not the default operator path

## Key Gaps
- The official landscape assumes users can combine CLI, dashboard, DNS provider, and Git context mentally; there is no compact “single packet” operator abstraction.
- Promote/rollback are provider-specific and caveat-heavy, but many summaries still flatten them into “make live” / “undo” buttons.
- Env sync and domain verification remain hybrid workflows that often require manual follow-up even when the main deploy succeeds.
- Repo-local discovery drift is currently a bigger gap than missing scope: `vercel-deploy/SKILL.toon` still advertises the old claimable tarball flow instead of the current linked-project operator reality.

## Contradictions
- **Marketed simplicity vs operator reality:** provider messaging suggests fast deploy flows, but real usage still involves staged release packets, manual DNS checks, env re-pulls, and post-promote verification.
- **“Promote” sounds like pointer-switching, but current docs say preview-to-production promotion creates a new production deployment and can require extra flags/confirmation.**
- **CLI and dashboard both claim control, but incident threads show teams switching between them because either surface alone can be insufficient or misleading in edge cases.**

## Key Insight
The durable abstraction is not “deploy to Vercel” as a single action. It is **Vercel operator state management**: linked project status, target environment, build mode, URL/domain target, env scope, and cutover/rollback verification. The best bounded improvement is to make `vercel-deploy` smaller and more routing-first around those packets, while syncing stale compact/discovery surfaces that still describe the pre-modernization claimable deploy shortcut.

## Curated Sources
- https://vercel.com/docs/deployments
- https://vercel.com/docs/concepts/deployments/overview
- https://vercel.com/docs/cli/deploying-from-cli
- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/cli/project-linking
- https://vercel.com/docs/deployments/git
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/cli/alias
- https://vercel.com/docs/cli/domains
- https://vercel.com/docs/domains/set-up-custom-domain
- https://vercel.com/docs/domains/working-with-domains
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/environment-variables/system-environment-variables
- https://vercel.com/docs/cli/env
- https://vercel.com/docs/cli/promote
- https://vercel.com/docs/cli/rollback
- https://vercel.com/docs/instant-rollback
- https://vercel.com/docs/deployment-checks
- https://vercel.com/docs/deploy-hooks
- https://github.com/vercel/vercel/issues/11712
- https://github.com/vercel/vercel/issues/15095
- https://github.com/vercel/vercel/issues/15577
- https://github.com/vercel/vercel/issues/12022
- https://github.com/vm0-ai/vm0/pull/9847
