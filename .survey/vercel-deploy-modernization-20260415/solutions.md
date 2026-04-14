# Solution Landscape: vercel-deploy modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Current `vercel-deploy` skill | Custom claimable deploy script + framework detection | Fast one-shot preview URL generation in specific environments | Stale boundary, depends on custom endpoint, underspecifies linked-project/Vercel CLI workflows, no refs/evals | Best candidate for modernization rather than replacement |
| Vercel CLI docs (`vercel deploy`, `vercel alias`, `vercel env`, `vercel inspect`, `vercel promote`, `vercel rollback`) | Official provider workflow | Current commands, explicit preview/prod/env/rollback guidance | Spread across multiple docs; easy for agents to miss mode selection and boundaries | Primary source layer |
| Vercel KB alias guide | Focused preview alias recipe | Shows stable preview URL workflow and GitHub Actions pattern | Covers one sub-problem, not the whole provider skill | Good support doc input |
| `deployment-automation` | Vendor-neutral release-execution anchor | Already owns rollout strategy / provider-neutral release packets | Intentionally routes Vercel specifics away | Confirms modernization target should be `vercel-deploy`, not a new generic skill |
| Manual UI + CLI workaround practice | Human operational fallback | Useful when env/domain settings behave unexpectedly | Tribal knowledge, inconsistent, not reusable unless captured in skill docs | Should be codified as troubleshooting guidance |

## Categories
- **Official provider operations**: Vercel docs for environments, deploy, promote, instant rollback, domains, env vars
- **Focused provider workflow guides**: alias KB and related preview-deployment docs
- **Repo-internal adjacent skills**: `deployment-automation`, `workflow-automation`, `system-environment-setup`
- **User-reported operational reality**: community env-sync issues and auth/canonical-URL friction when building through CLI workflows

## What People Actually Use
In practice, Vercel operations are multi-step. Teams link the project, pull environment metadata, build or deploy prebuilt artifacts, inspect the target deployment, test the preview URL, then either alias it to a stable branch URL or promote it to production. When environment handling is confusing, they fall back to `vercel env ls`, environment-specific settings pages, and explicit app-level canonical URL variables rather than assuming automatic system values are enough.

## Frequency Ranking
1. **Official Vercel CLI + docs flow** — dominant and current.
2. **Preview aliasing / stable preview URL pattern** — common enough to have a dedicated KB guide.
3. **Env-scoping troubleshooting** — recurring operational pain in discussion/community surfaces.
4. **Anonymous claimable deploy shortcut** — niche legacy helper, not the canonical operational model.

## Key Gaps
- The repo has a clean generic-vs-provider deployment boundary, but `vercel-deploy` still does not teach current Vercel mode selection.
- The skill lacks reusable support files for preview/prod promotion, env/domain hygiene, and provider-specific troubleshooting.
- There are no evals to keep the skill narrow enough to avoid stealing generic rollout strategy or CI-yaml work.

## Contradictions
- **Marketed shortcut vs operator reality**: the existing skill implies "deploy instantly, no auth required" is sufficient, but current Vercel docs emphasize linked projects, environment-specific config, promotion, and rollback.
- **UI confidence vs verifiable state**: community evidence shows env variables may appear set in the UI while `vercel env ls` and actual deployments are the trustworthy check.
- **Automatic system values vs app-specific needs**: `VERCEL_URL`/system envs help, but some app flows still need explicit canonical-url handling in preview and production.

## Key Insight
The best bounded improvement is not a new Vercel-adjacent wrapper. It is modernizing `vercel-deploy` into the provider-specific operations anchor that starts from a linked Vercel project, selects a concrete mode (preview deploy, production deploy, alias/domain, env sync, rollback), and explicitly routes generic release strategy back to `deployment-automation`. That keeps the repo's deployment boundary coherent while making the Vercel lane actually usable.
