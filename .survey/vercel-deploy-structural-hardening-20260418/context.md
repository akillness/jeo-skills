# Context: vercel-deploy structural hardening

## Workflow Context
`vercel-deploy` sits in a workflow that is no longer just “ship a tarball and get a URL.” Vercel’s own docs treat deployment work as a mix of Git-driven preview/prod automation, CLI-led operator flows, promotion/cutover, domain assignment, env sync, and rollback response. Preview deployments are explicitly framed as the collaboration environment for testing, QA, and review; the CLI is the fallback/automation surface for linked projects, prebuilt artifacts, direct production deploys, staged production builds, aliases, promotion, rollback, and env sync. Generated URLs are public by default unless deployment protection is configured, so deployment work often overlaps with review sharing and access-control decisions.

Sources:
- https://vercel.com/docs/concepts/deployments/overview
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/deployments/preview-deployments
- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/cli/promote
- https://vercel.com/docs/cli/pull
- https://vercel.com/docs/deploy-hooks
- https://vercel.com/docs/deployments/generated-urls
- https://vercel.com/docs/deployment-protection

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| App developer | Push branches/PRs, inspect preview URLs, trigger manual deploys when needed | Intermediate |
| Reviewer / QA / PM | Validate preview deployments before production promotion | Low to intermediate |
| Platform / DevOps maintainer | Run CLI deploys, prebuilt flows, promotion, rollback, env sync, and domain operations | Intermediate to advanced |
| Monorepo / fullstack team | Coordinate frontend deploy boundaries, subdir builds, and prebuilt CI artifacts | Advanced |
| Incident responder / site owner | Roll back production, inspect logs, verify traffic/domain state | Intermediate |

Sources:
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/cli/promote
- https://vercel.com/docs/cli/rollback
- https://github.com/vercel/vercel/issues/3547
- https://github.com/vercel/vercel/issues/11097

## Current Workarounds
1. **Git integration first, CLI second.** Teams rely on automatic preview/prod deploys for the happy path, then drop to `vercel deploy`, `vercel --prod`, or dashboard redeploys when the automated path is not enough.
2. **Build now, switch traffic later.** A common safe-release pattern is staged deployment (`--skip-domain`) followed by verification, then `vercel promote` once the build, migrations, and smoke checks look good.
3. **Treat deploy stdout as a packet.** Teams capture the deployment URL from CLI output, then pass it into later steps like aliasing, promotion, and release notes.
4. **Keep env sync semi-manual.** `vercel env pull` / `vercel pull` help, but operators still reopen the dashboard and copy values or re-check environment scope manually when preview/prod behavior diverges.
5. **Use dashboard + registrar together for domains.** Domain setup still means Vercel-side configuration plus registrar/DNS changes plus waiting for propagation.
6. **Rollback with extra checks.** Operators pair rollback/promote flows with browser checks, logs, and sometimes DB/app verification rather than assuming the traffic switch alone proves recovery.

Sources:
- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/cli/promote
- https://vercel.com/docs/cli/env
- https://vercel.com/docs/domains/working-with-domains/add-a-domain
- https://github.com/enometa820/enometa-shopingmall/issues/13
- https://github.com/h-yabi2/Next.js-book-commerce-app/issues/1
- https://github.com/fritzschoff/roessle/issues/2
- https://github.com/onciopescini/WAC/issues/9
- https://github.com/vm0-ai/vm0/pull/9847

## Adjacent Problems
- **Environment scope confusion:** preview vs production vs development/custom envs still cause drift, and env changes only apply to new deployments.
- **Preview noise / deploy churn:** auto-deploy previews are useful, but automation-heavy repos can flood teams with noisy previews.
- **Monorepo / prebuilt fragility:** subdir builds and prebuilt flows are powerful but brittle when CLI releases or system vars change unexpectedly.
- **Access-control mismatch:** generated preview URLs are public by default unless deployment protection is configured.
- **Promotion / rollback footguns:** promote semantics, team scope, custom-domain side effects, and plan-based rollback limits are easy to misread.

Sources:
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/cli/promote
- https://vercel.com/docs/cli/rollback
- https://vercel.com/docs/deployment-protection
- https://github.com/vercel/vercel/issues/2452
- https://github.com/vercel/vercel/issues/3166
- https://github.com/vercel/vercel/issues/11097
- https://github.com/vercel/vercel/issues/11712
- https://github.com/vercel/vercel/issues/15095

## User Voices
> “Deploy previews are awesome, it's definitely an essential feature for our workflow … we would prefer to not flood our … pre-deploys with it.”  
Source: https://github.com/vercel/vercel/issues/3166

> “Could not find a proper solution for a seemingly widely used workflow” for local + staging + production envs with Git integration.  
Source: https://github.com/vercel/vercel/issues/2452

> “Turborepo + pnpm … our pipeline has been broken by a bad CLI release.”  
Source: https://github.com/vercel/vercel/issues/11097#issuecomment-1912212014

> Empty commits did not retrigger deploys, dashboard redeploy used the wrong commit, and direct `vercel --prod` plus browser hard refresh became the reliable fallback.  
Source: https://github.com/enometa820/enometa-shopingmall/issues/13
