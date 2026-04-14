---
name: vercel-deploy
description: >
  Handle Vercel-specific deployment operations for linked web/fullstack projects:
  preview deploys, production deploys, preview-to-production promotion, stable
  preview aliases, domain assignment, environment-variable sync, and rollback
  checks. Use when the request is specifically about deploying on Vercel,
  promoting a Vercel preview build, fixing Vercel env/domain/alias workflow
  problems, or rolling back a Vercel deployment. Triggers on: Vercel deploy,
  Vercel preview URL, Vercel alias, vercel promote, Vercel domain, Vercel env,
  Vercel rollback, and Vercel CLI deployment. Route provider-neutral release
  strategy to `deployment-automation`, CI YAML authoring to
  `workflow-automation`, and machine/bootstrap issues to
  `system-environment-setup`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best when a repository already targets Vercel and either has the Vercel CLI
  available or can follow dashboard-backed Vercel workflows. Assumes the agent
  can inspect repo config and run Vercel commands if authenticated.
license: MIT
metadata:
  tags: vercel, deployment, preview, production, alias, domains, environment-variables, rollback
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0.0"
  modernization: 2026-04-15
  source: akillness/oh-my-skills
---

# Vercel Deploy

Use this skill when the job is **operating a deployment on Vercel specifically**, not generic release planning.

`vercel-deploy` is the provider-specific anchor for:
- creating or verifying Vercel preview deployments
- promoting a verified preview deployment to production
- direct production deploys on Vercel when that is explicitly the job
- stable preview aliases and branch/demo URLs
- custom-domain assignment and post-domain checks
- Vercel environment-variable sync/troubleshooting
- production rollback / instant rollback checks on Vercel

Read these support docs before choosing the mode:
- [references/modes-and-boundaries.md](references/modes-and-boundaries.md)
- [references/preview-production-command-packets.md](references/preview-production-command-packets.md)
- [references/env-domain-rollback-troubleshooting.md](references/env-domain-rollback-troubleshooting.md)

## When to use this skill
- The user explicitly wants to deploy a site/app/service **on Vercel**
- The request is about a Vercel preview URL, preview alias, or branch demo environment
- A Vercel preview deployment needs to be inspected, tested, and promoted to production
- A Vercel project needs environment variables pulled, listed, added, or checked by environment
- The deployment problem is really about Vercel domains, aliases, generated URLs, or rollback behavior
- The user already chose Vercel and needs provider-specific operational steps instead of a vendor-neutral release plan

## When not to use this skill
- **The main question is generic rollout strategy, release gating, staging/prod policy, or cross-provider deployment design** → use `deployment-automation`
- **The main job is editing GitHub Actions / CI YAML / task runners around the deploy flow** → use `workflow-automation`
- **The main job is installing Node, Vercel CLI, auth bootstrap, or making the machine runnable** → use `system-environment-setup`
- **The main job is debugging app/runtime/build logic before the deploy step works at all** → use `debugging` or the relevant framework/build skill first
- **The main job is long-lived telemetry / SLO / alerting design after deployment** → use `monitoring-observability`

## Instructions

### Step 1: Classify the Vercel job before touching commands
Normalize the request into one primary mode.

```yaml
vercel_mode:
  primary_mode: preview-deploy | production-deploy | promote-preview | alias-domain | env-sync | rollback-response
  project_state: linked | unlinked | unknown
  artifact_mode: source-build | prebuilt | unknown
  target_environment: preview | production | custom | unknown
  domain_shape: generated-url | preview-alias | custom-domain | mixed | none
  env_scope: preview | production | development | custom | mixed | none
  verification_depth: none | smoke | health-plus-logs | release-checklist
```

Choose exactly one primary mode per run:
- `preview-deploy` → create or refresh a Vercel preview deployment
- `production-deploy` → direct production deployment on Vercel
- `promote-preview` → verify and promote a known-good preview deployment to production
- `alias-domain` → set a stable preview alias or attach/verify a custom domain
- `env-sync` → inspect or fix environment-variable scope and application to new deployments
- `rollback-response` → revert production traffic safely and document caveats

### Step 2: Gather the minimum truthful evidence
Do not guess from the framework name alone. Pull the smallest credible set first:
1. Is the project already linked to Vercel (`vercel link` / `.vercel/project.json`) or still unlinked?
2. Is the request about preview, production, or a custom environment?
3. Is the deploy path source-based (`vercel deploy`) or prebuilt (`vercel build` + `vercel deploy --prebuilt`)?
4. Which URL shape matters: generated `*.vercel.app`, stable preview alias, or custom production domain?
5. Which env scope matters: preview, production, development, or custom environment?
6. What proof is expected: URL only, health check, logs, promotion, or rollback?

If one of these is missing, state the assumption and pick the smallest safe interpretation.

### Step 3: Use the right packet for the mode

#### A. Preview deploy
Use when the main need is a testable Vercel preview.

Recommended sequence:
```bash
# Link if needed
vercel link

# Pull preview env metadata if using CLI-based builds
vercel pull --yes --environment=preview

# Option 1: source deploy
vercel deploy

# Option 2: prebuilt deploy
vercel build
vercel deploy --prebuilt
```

Then verify:
```bash
vercel inspect <deployment-url>
vercel logs --deployment <deployment-url> --level error --limit 50
```

Output packet:
```markdown
# Vercel Preview Packet
- Deployment URL:
- Branch / commit:
- Build mode: source-build | prebuilt
- Env scope used: preview | custom
- Verification completed:
- Next step: share | alias | promote | debug
```

#### B. Promote preview to production
Use when a preview deployment is already built and should become prod.

Recommended sequence:
```bash
vercel list --environment preview
vercel inspect <deployment-url>
vercel curl /api/health --deployment <deployment-url>
vercel logs --deployment <deployment-url> --level error --limit 50
vercel promote <deployment-url> --yes
vercel promote status
vercel logs --environment production --level error --since 5m
```

Rules:
- Verify the preview deployment matches the intended branch/commit before promote.
- Prefer promoting a known-good deployment over rebuilding blindly when the goal is release confidence.
- Report the production verification result separately from the promotion step.

#### C. Direct production deploy
Use when the user explicitly wants a fresh production deployment now.

Recommended sequence:
```bash
vercel pull --yes --environment=production
vercel deploy --prod
# or, for prebuilt flows
vercel build --prod
vercel deploy --prebuilt --prod
```

Always capture:
- whether the deploy was source-build or prebuilt
- production URL/domain reached
- any post-deploy smoke/health/log check performed

#### D. Alias or domain operations
Use when the stable URL is the real job.

Preview alias pattern:
```bash
url="$(vercel deploy --prebuilt)"
vercel alias set "$url" preview.example.com
```

For custom domains, gather first:
- project already owns the domain or not
- preview alias vs production domain intent
- whether DNS is already pointed correctly

Then report:
```markdown
# Vercel URL / Domain Packet
- Deployment URL:
- Alias/domain applied:
- Scope: preview | production
- DNS / verification status:
- Remaining manual step (if any):
```

#### E. Environment-variable sync / troubleshooting
Use when deployment behavior differs across preview/production/custom environments.

Checklist:
1. Identify which environment(s) the variable should apply to.
2. Check whether a new deployment is required for the change to take effect.
3. Prefer environment-scoped verification (`vercel env ls`, environment-specific settings) over UI assumptions alone.
4. Distinguish system vars (`VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_URL`) from app-level canonical URL vars that may still need explicit configuration.

Suggested commands:
```bash
vercel env ls
vercel pull --yes --environment=preview
vercel pull --yes --environment=production
```

When a preview auth/callback flow is failing, explicitly check whether the app needs a canonical preview URL variable instead of relying only on `VERCEL_URL`.

#### F. Rollback response
Use when production traffic must revert quickly.

Checklist:
1. Identify the currently bad production deployment.
2. Identify the target rollback deployment and whether it is eligible.
3. Call out stale-config caveats before treating rollback as a perfect restore.
4. Re-verify production after rollback.

Operational notes from Vercel docs:
- rollback restores a previous deployment state
- env/config can become stale relative to current project settings
- cron-job state can roll back with the deployment
- rollback eligibility differs by plan

### Step 4: Keep the boundary clean
Use this route-out table whenever the request drifts:

| If the request sounds like... | Use |
|---|---|
| "Design the release gates / canary / rollback strategy across providers" | `deployment-automation` |
| "Rewrite the GitHub Actions workflow that runs Vercel deploy" | `workflow-automation` |
| "Install Vercel CLI, Node, auth, or link local machine credentials" | `system-environment-setup` |
| "The app crashes or the framework build is broken before deploy" | `debugging` or framework-specific skill |
| "Set up dashboards, alerts, and ongoing post-release observability" | `monitoring-observability` |
| "Inspect, deploy, promote, alias, domain-manage, or roll back on Vercel" | `vercel-deploy` |

### Step 5: Mention the legacy claimable deploy helper only when it is truly the environment's contract
This skill directory still contains `scripts/deploy.sh`, a claimable-preview helper for environments that explicitly rely on that custom endpoint. Treat it as a **legacy / environment-specific shortcut**, not the default Vercel operational model.

Use it only when all of these are true:
- the runtime explicitly expects the claimable deploy endpoint
- the job is just creating a claimable preview URL
- linked-project / env / alias / promotion / rollback operations are out of scope

Otherwise prefer the official Vercel CLI workflow above.

## Output format
Return a mode-specific packet, not just raw commands.

Minimum structure:
```markdown
# Vercel Operation Summary
- Mode:
- Project linked:
- Target environment:
- URL / deployment:
- Verification performed:
- Remaining risk or manual step:
- Routed-out work (if any):
```

## Examples

### Example 1: Preview deploy with stable alias
User asks: "Deploy this Next.js branch to Vercel and give me a stable preview URL."

Expected move:
- choose `preview-deploy` mode
- deploy via `vercel deploy` or `vercel deploy --prebuilt`
- capture the deployment URL
- alias it with `vercel alias set`
- return the preview packet with both generated and stable URLs

### Example 2: Promote a verified preview deployment
User asks: "This preview deployment looks good. Make it production."

Expected move:
- choose `promote-preview` mode
- inspect and smoke-test the preview deployment
- run `vercel promote <deployment-url> --yes`
- verify production logs/health separately
- report production verification, not just promotion success

### Example 3: Vercel env vars not showing up in deploys
User asks: "The variable is in the Vercel UI but the deployment can't read it."

Expected move:
- choose `env-sync` mode
- verify the intended environment scope
- confirm a new deployment happened after the env change
- use CLI/env listing or environment-specific settings as the trusted state check
- call out any app-level canonical URL/config still required

## Best practices
1. Start by selecting a single Vercel mode; don't mix preview, prod, env repair, and rollback into one vague answer.
2. Prefer linked-project, official CLI flows over one-off tarball shortcuts.
3. Treat preview verification and production promotion as separate steps.
4. Always distinguish generated deployment URLs, stable preview aliases, and custom domains.
5. Remember that environment-variable changes only affect new deployments.
6. Do not oversell rollback as lossless; call out stale env/config caveats.
7. Route generic rollout design back to `deployment-automation` to avoid overlap.

## References
- [Vercel CLI deploy docs](https://vercel.com/docs/cli/deploy)
- [Vercel environments docs](https://vercel.com/docs/deployments/environments)
- [Promote preview to production](https://vercel.com/docs/deployments/promote-preview-to-production)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Instant rollback](https://vercel.com/docs/instant-rollback)
- [Preview alias guide](https://vercel.com/kb/guide/how-to-alias-a-preview-deployment-using-the-cli)
