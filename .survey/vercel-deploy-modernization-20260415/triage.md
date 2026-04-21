# Triage
- Problem: `vercel-deploy` is a stale vendor skill centered on a claimable anonymous deploy script instead of the current Vercel CLI workflow around linked projects, preview vs production environments, aliases/domains, environment-variable sync, promotion, and rollback.
- Audience: Agents and developers deploying web/fullstack projects to Vercel, especially when they need preview verification, production promotion, domain/alias setup, environment hygiene, or rollback guidance.
- Why now: `deployment-automation` already routes Vercel-specific work into `vercel-deploy`, but the target skill still underspecifies current Vercel operations and has no references/evals, so the repo boundary is clean while the provider-specific anchor is weak.
