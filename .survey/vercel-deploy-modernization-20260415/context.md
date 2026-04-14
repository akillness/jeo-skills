# Context: vercel-deploy modernization

## Workflow Context
`vercel-deploy` sits on the provider-specific side of the repo's deployment boundary. The surrounding repo already treats `deployment-automation` as the vendor-neutral release-execution anchor and routes Vercel-specific operations into `vercel-deploy`, but the current skill still behaves like a one-shot anonymous deploy helper.

Current Vercel docs describe a richer lifecycle: linked projects, preview vs production environments, per-environment variables, preview verification before promotion, alias/domain management, and rollback of production traffic. That means the high-value workflow is no longer just "ship this tarball and return a URL"; it is "connect the project, choose preview or production mode, sync the right env/config, verify the deployment, then alias/promote/rollback safely."

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend/fullstack developer | Deploy PR branches and production releases on Vercel | Intermediate |
| Agent maintaining a web repo | Map a user request to preview deploy, alias/domain change, env sync, or rollback | Intermediate |
| Release owner / tech lead | Promote a known-good preview to production and verify post-deploy health | Intermediate to advanced |
| Dev tooling maintainer | Keep provider-specific skill boundaries aligned with repo-level deployment skills | Advanced |

## Current Workarounds
1. **Anonymous/claimable deploy shortcut** — the current skill pushes a tarball to a custom claimable endpoint and treats the returned preview URL as the whole job. Limitation: it skips project linking, environment scoping, promotion, alias/domain setup, and rollback handling.
2. **Vendor-neutral deployment skill + memory** — users may route through `deployment-automation` and then remember Vercel-specific commands themselves. Limitation: the provider-specific boundary exists, but the provider-specific anchor is underpowered.
3. **Manual CLI command stitching** — Vercel's current docs show real workflows using `vercel link`, `vercel pull`, `vercel build`, `vercel deploy --prebuilt`, `vercel alias`, `vercel inspect`, `vercel promote`, and `vercel logs`. Limitation: without a repo skill, agents may miss ordering, environment targeting, or verification steps.
4. **Environment-variable UI fallback** — community evidence shows people sometimes work around UI/env confusion by checking the dedicated environment pages or validating with `vercel env ls`. Limitation: this is operational knowledge not captured in the current skill.

## Adjacent Problems
- Build failures and framework packaging still belong to ordinary debugging/setup work before `vercel-deploy`.
- Workflow YAML authoring belongs to `workflow-automation`, not the provider skill.
- Release strategy selection across providers still belongs to `deployment-automation`.
- Environment-variable confusion is partly a Vercel-specific workflow problem and partly an app/runtime problem (for example how auth libraries derive canonical URLs).

## User Voices
- Vercel docs: preview verification and promotion are now a first-class workflow: the guide explicitly walks through `vercel list`, `vercel inspect`, `vercel curl`, `vercel logs`, and `vercel promote` before production verification. Source: https://vercel.com/docs/deployments/promote-preview-to-production
- Vercel docs: environment variables are scoped by environment and only apply to new deployments; production deployments are created by pushing to the production branch or running `vercel --prod`, while preview deployments come from non-production branches or plain `vercel`. Source: https://vercel.com/docs/environment-variables
- Vercel Knowledge Base: stable preview aliases are a distinct workflow layered on top of `vercel deploy`, using the deployment URL from standard output and then `vercel alias set`. Source: https://vercel.com/kb/guide/how-to-alias-a-preview-deployment-using-the-cli
- GitHub discussion indexed via Yahoo + direct page: when teams switched from Git integration to Vercel CLI in GitHub Actions, preview builds could break because `VERCEL_URL` was empty and `NEXTAUTH_URL` had to be handled explicitly. Source: https://github.com/nextauthjs/next-auth/discussions/5011
- Vercel Community: a 2025 report describes env variables appearing in the UI but not being applied to deployments, with `vercel env ls` and environment-specific pages used as the trustworthy fallback. Source: https://community.vercel.com/t/potential-bug-with-env-variable-settings-page/3855
