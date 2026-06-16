---
name: vercel-deploy
description: >
  Run Vercel-specific deployment operations for linked web/fullstack projects:
  preview deploys, direct production deploys, staged deploy + promote flows,
  aliases/domains, environment-variable sync, and rollback response. Use when the
  request is specifically about operating a project on Vercel after the provider
  is already chosen — especially when someone needs a preview URL, stable alias,
  custom domain, env-scope fix, production cutover, or rollback on Vercel.
  Triggers on: Vercel deploy, Vercel preview URL, vercel promote, vercel alias,
  Vercel domain, Vercel env, Vercel rollback, and Vercel CLI deployment. Route
  provider-neutral release strategy to `deployment-automation`, CI/workflow
  authoring to `workflow-automation`, and local install/auth/bootstrap work to
  `system-environment-setup`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best when a repository already targets Vercel and either has the Vercel CLI
  available or can follow dashboard-backed Vercel workflows. Assumes the agent
  can inspect repo config and run Vercel commands if authenticated.
license: MIT
metadata:
  tags: vercel, deployment, preview, production, promote, alias, domains, environment-variables, rollback
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  modernization: 2026-04-15
  structural_hardening: 2026-04-18
  source: akillness/jeo-skills
---

# Vercel Deploy

Use this skill when the job is **operating a deployment on Vercel specifically**, not designing generic rollout policy.

`vercel-deploy` is the provider-specific front door for:
- creating or refreshing Vercel preview deployments
- running a direct production deployment on Vercel
- staging a deploy, verifying it, then promoting it live
- assigning a stable preview alias or attaching a custom domain
- inspecting/fixing Vercel environment-variable scope and redeploy needs
- responding to a bad production deployment with rollback-oriented checks

Read these support docs before choosing the mode:
- [references/modes-and-boundaries.md](references/modes-and-boundaries.md)
- [references/preview-production-command-packets.md](references/preview-production-command-packets.md)
- [references/env-domain-rollback-troubleshooting.md](references/env-domain-rollback-troubleshooting.md)

## When to use this skill
- The user explicitly wants to deploy a project **on Vercel**
- The job is about a Vercel preview URL, preview alias, or stable demo environment
- A linked Vercel deployment already exists and needs promotion or rollback handling
- The main issue is Vercel env scope, Vercel domain/alias state, or Vercel-specific release verification
- The provider has already been chosen and the user needs Vercel operator guidance rather than vendor-neutral release design

## When not to use this skill
- **The main question is generic rollout strategy, release gating, canary policy, or cross-provider deployment design** → use `deployment-automation`
- **The main job is editing GitHub Actions / CI YAML / task runners around the deploy flow** → use `workflow-automation`
- **The main job is installing Node, Vercel CLI, auth bootstrap, or linking the local machine** → use `system-environment-setup`
- **The app/framework/build is broken before the deploy path itself works** → use `debugging` or the relevant framework/build skill first
- **The main job is long-lived telemetry, SLOs, or alerting after release** → use `monitoring-observability`

## Instructions

### Step 1: Normalize the Vercel job into one packet
Choose exactly one primary mode before reaching for commands.

```yaml
vercel_packet:
  primary_mode: preview-deploy | production-deploy | promote-preview | alias-domain | env-sync | rollback-response
  project_state: linked | unlinked | unknown
  build_mode: source-build | prebuilt | unknown
  target_environment: preview | production | development | custom | unknown
  url_goal: generated-url | stable-preview-alias | custom-domain | mixed | none
  verification_depth: none | smoke | health-plus-logs | release-checklist
```

Primary modes:
- `preview-deploy` — create or refresh a testable Vercel preview
- `production-deploy` — run a direct fresh production deployment
- `promote-preview` — verify an existing deployment, then make it current
- `alias-domain` — apply/verify a stable preview alias or custom domain
- `env-sync` — fix environment-variable scope or stale local/project env state
- `rollback-response` — move production back to a known-good deployment and verify recovery

If the request contains multiple goals, pick the one that owns the first answer and route the rest explicitly.

### Step 2: Gather only the minimum truthful evidence
Do not guess from the framework name alone. Confirm the smallest credible set first:
1. Is the project already linked to Vercel (`vercel link`, `.vercel/project.json`, or dashboard evidence)?
2. Is the target really preview, production, or a custom/development environment?
3. Is the deploy path source-based or prebuilt?
4. Does the user care about the generated deployment URL, a stable alias, or a custom domain?
5. Is this actually a deploy/cutover problem, or an env/config mismatch that still needs redeploy?
6. What proof is expected: URL only, smoke check, health + logs, DNS verification, or rollback verification?

If one item is unknown, state the assumption instead of pretending the mode is fully known.

### Step 3: Use the matching operator path
Do not dump every command at once. Pick the reference packet that matches the mode.

#### A. `preview-deploy`
Use when the deliverable is a testable preview deployment.
- Prefer linked-project CLI or dashboard-backed preview flows.
- Return the generated deployment URL plus any stable alias plan.
- If the goal is a stable demo URL, carry the result into `alias-domain` rather than mixing everything into one blob.

Use packet: `references/preview-production-command-packets.md#preview-deploy-packet`

#### B. `production-deploy`
Use when the user explicitly wants a fresh production deployment now.
- Say whether the deployment is source-build or prebuilt.
- Report the production URL/domain reached.
- Separate deploy success from post-deploy verification.

Use packet: `references/preview-production-command-packets.md#direct-production-deploy-packet`

#### C. `promote-preview`
Use when a deployment already exists and the job is to cut over safely.
- Verify the exact deployment URL/commit before promotion.
- Treat promotion as a release operation, not a magical pointer flip.
- Note team-scope or domain caveats when they matter.
- Report production verification separately from the promote command itself.

Use packet: `references/preview-production-command-packets.md#staged-production--promote-packet`

#### D. `alias-domain`
Use when the stable URL is the real deliverable.
- Distinguish generated URL vs stable preview alias vs production custom domain.
- Report DNS/manual verification status separately from CLI success.
- Keep the raw deployment URL available as fallback evidence.

Use packet: `references/env-domain-rollback-troubleshooting.md#aliases-and-domains`

#### E. `env-sync`
Use when preview/prod behavior differs because variables are missing, stale, or scoped incorrectly.
- Check the intended environment first.
- Call out that env-var changes apply to **new deployments**, not old ones.
- Distinguish Vercel env scope from app-level canonical URL/config expectations.

Use packet: `references/env-domain-rollback-troubleshooting.md#environment-variables`

#### F. `rollback-response`
Use when production traffic must revert quickly.
- Identify the currently bad deployment and the exact rollback target.
- Call out stale-config / cron / plan-limit caveats before claiming recovery.
- Re-check production logs/health after rollback.

Use packet: `references/env-domain-rollback-troubleshooting.md#rollback`

### Step 4: Keep boundaries clean while answering
Use this route-out table whenever the request drifts.

| If the request sounds like... | Use |
|---|---|
| “Design the release gates, canary policy, or rollback strategy across providers” | `deployment-automation` |
| “Rewrite the GitHub Actions workflow that runs Vercel commands” | `workflow-automation` |
| “Install Vercel CLI, auth, Node, or link local credentials” | `system-environment-setup` |
| “The build crashes before deploy succeeds” | `debugging` or a framework-specific skill |
| “Set up dashboards, alerts, or long-lived post-release monitoring” | `monitoring-observability` |
| “Inspect, deploy, promote, alias, domain-manage, env-sync, or roll back on Vercel” | `vercel-deploy` |

### Step 5: Mention the legacy claimable deploy helper only if the environment explicitly depends on it
This directory still ships `scripts/deploy.sh`, a claimable-preview helper that packages a tarball and returns preview/claim URLs. Treat it as a **legacy environment-specific shortcut**, not the default Vercel operating model.

Use it only when all of these are true:
- the runtime explicitly expects the claimable deploy endpoint
- the job is just creating a claimable preview URL
- linked-project, promotion, alias/domain, env-sync, and rollback operations are out of scope

Otherwise prefer the official Vercel CLI / dashboard model described above.

## Output format
Return a mode-specific packet instead of a loose command dump.

Minimum structure:
```markdown
# Vercel Operation Summary
- Mode:
- Project linked:
- Build mode:
- Target environment:
- URL / deployment:
- Verification performed:
- Remaining risk or manual step:
- Routed-out work (if any):
```

## Examples

### Example 1: Preview deploy with stable alias
User asks: “Deploy this Next.js branch to Vercel and give me a stable preview URL.”

Expected move:
- choose `preview-deploy` as the primary mode
- deploy via the preview packet
- capture the generated deployment URL
- apply or plan a stable alias separately
- return both URLs and any DNS/manual step still needed

### Example 2: Promote a verified staged deployment
User asks: “This Vercel build already passed QA. Promote it to production and verify it.”

Expected move:
- choose `promote-preview` as the primary mode
- verify the exact deployment/commit first
- run the staged-production promote packet
- report production verification after promotion
- mention scope/domain caveats if they apply

### Example 3: Vercel env vars not showing up in deploys
User asks: “The variable is in Vercel, but the deployment can’t read it.”

Expected move:
- choose `env-sync`
- verify the intended environment scope
- confirm whether a new deployment happened after the env change
- use Vercel env inspection/pull as the trusted state check
- call out any app-level canonical URL/config still required

### Example 4: Route out generic release design
User asks: “Help me design our staging-to-prod rollout policy and canary rules across providers.”

Expected move:
- do **not** pretend this is a Vercel-only operation
- route the main job to `deployment-automation`
- keep only any explicitly Vercel-specific follow-up inside `vercel-deploy`

## Best practices
1. Pick one primary Vercel mode before giving commands.
2. Prefer linked-project, official CLI/dashboard flows over legacy tarball shortcuts.
3. Treat deploy, promote, alias/domain, env repair, and rollback as distinct operator packets.
4. Always distinguish generated deployment URLs, stable preview aliases, and custom domains.
5. Remember that env-var changes only affect new deployments.
6. Do not oversell `vercel promote` or rollback as lossless; call out scope/domain/plan/config caveats.
7. Route generic rollout design back to `deployment-automation` to avoid overlap.

## References
- [Deploying Projects from Vercel CLI](https://vercel.com/docs/cli/deploying-from-cli)
- [vercel deploy](https://vercel.com/docs/cli/deploy)
- [vercel promote](https://vercel.com/docs/cli/promote)
- [vercel rollback](https://vercel.com/docs/cli/rollback)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Working with domains](https://vercel.com/docs/domains/working-with-domains)
- [Deploying Git Repositories with Vercel](https://vercel.com/docs/deployments/git)
