# Vercel Deploy Modes and Boundaries

## Primary modes

### 1. `preview-deploy`
Use when the main deliverable is a testable preview deployment URL on Vercel.

Signals:
- "Deploy this branch"
- "Give me a preview URL"
- "Create a PR/demo deployment"

Typical commands:
- `vercel link`
- `vercel pull --yes --environment=preview`
- `vercel deploy`
- `vercel deploy --prebuilt`
- `vercel inspect <deployment-url>`

### 2. `production-deploy`
Use when the user explicitly wants a fresh production deployment on Vercel.

Signals:
- "Deploy this to Vercel production"
- "Ship this live on Vercel now"

Typical commands:
- `vercel pull --yes --environment=production`
- `vercel deploy --prod`
- `vercel build --prod && vercel deploy --prebuilt --prod`

### 3. `promote-preview`
Use when a preview deployment already exists and the job is to promote that exact deployment after verification.

Signals:
- "Promote this preview to production"
- "This preview is good — make it prod"

Typical commands:
- `vercel list --environment preview`
- `vercel inspect <deployment-url>`
- `vercel curl /api/health --deployment <deployment-url>`
- `vercel logs --deployment <deployment-url> --level error --limit 50`
- `vercel promote <deployment-url> --yes`

### 4. `alias-domain`
Use when the stable URL is the actual goal.

Signals:
- "Give this preview a stable URL"
- "Attach this custom domain"
- "Alias the deployment"

Typical commands:
- `vercel alias set <deployment-url> <alias>`
- domain/dashboard verification steps

### 5. `env-sync`
Use when the deployment behavior differs because variables are missing, stale, or scoped to the wrong environment.

Signals:
- "The variable is in Vercel but not in the deployment"
- "Preview has the wrong config"
- "Production picked up the wrong env"

Typical commands:
- `vercel env ls`
- `vercel pull --yes --environment=preview`
- `vercel pull --yes --environment=production`

### 6. `rollback-response`
Use when a bad production deployment must revert quickly.

Signals:
- "Roll back the broken deploy"
- "Restore the previous production build"

Typical inputs:
- current broken deployment
- target rollback deployment
- env/config caveats
- post-rollback verification plan

## Boundary rules

| Topic | Owner |
|---|---|
| Cross-provider rollout strategy, staging/prod policy, canary decisions | `deployment-automation` |
| CI/CD workflow authoring around Vercel commands | `workflow-automation` |
| Machine bootstrap, CLI install, auth setup | `system-environment-setup` |
| Broken app/framework/build before deploy works | `debugging` or framework skill |
| Ongoing observability and alerts after deploy | `monitoring-observability` |
| Vercel-specific preview/prod/env/domain/rollback operations | `vercel-deploy` |

## Legacy helper note
The bundled `scripts/deploy.sh` is a legacy claimable-preview helper. Treat it as an environment-specific shortcut, not the default Vercel operating model.
