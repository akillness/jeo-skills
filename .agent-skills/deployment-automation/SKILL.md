---
name: deployment-automation
description: >
  Plan and review release execution for web, backend, and fullstack systems:
  preview releases, staging-to-production promotion, rollout strategy, post-deploy
  verification, rollback response, and release-hardening checklists. Use when the
  system can already build and the main job is shipping or recovering a release
  safely, choosing between preview / promotion / canary / rollback paths, or
  tightening deploy gates around health checks and sign-off. Route CI workflow
  authoring to `workflow-automation`, machine/runtime setup to
  `system-environment-setup`, long-lived telemetry design to
  `monitoring-observability`, and Vercel-specific operations to `vercel-deploy`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for repositories or delivery workflows where the system can already build
  and the main problem is safe release execution, promotion, verification, or
  rollback across preview, staging, and production environments.
license: MIT
metadata:
  tags: deployment, release-rollout, preview-environments, rollback, progressive-delivery, post-deploy-verification, devops
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  modernization: 2026-04-16
  source: akillness/jeo-skills
---

# Deployment Automation

Use this skill when the job is **safe release execution after the system is already buildable**.

`deployment-automation` is the repo's release-execution anchor for:
- preview releases and shareable review environments
- staging → production promotion and sign-off gates
- rollout strategy choice: replace, rolling, blue-green, canary, progressive
- post-deploy verification and stop conditions
- rollback response and bad-release containment
- release-hardening packets around an existing deploy path

Read these support docs before deciding the packet:
- [references/deployment-modes-and-boundaries.md](references/deployment-modes-and-boundaries.md)
- [references/release-packet-templates.md](references/release-packet-templates.md)
- [references/strategy-selection-and-stop-conditions.md](references/strategy-selection-and-stop-conditions.md)
- [references/rollout-and-rollback-checklist.md](references/rollout-and-rollback-checklist.md)
- [references/platform-routing-notes.md](references/platform-routing-notes.md)

## When to use this skill
- A preview or branch deployment exists, but nobody agrees what it is supposed to prove before merge.
- A release already works mechanically, but staging/prod promotion still depends on tribal knowledge.
- The main decision is rollout strategy, release gates, verification depth, or rollback readiness.
- A deploy failed and the next job is containment, rollback, and safe recovery rather than broad platform redesign.
- The team needs a vendor-neutral release packet before using a platform-specific operator skill.
- You need to tighten an existing deploy path with preflight checks, sign-off logic, and explicit stop conditions.

## When not to use this skill
- **The main job is writing or refactoring GitHub Actions / GitLab / Jenkins / Buildkite workflows** → `workflow-automation`
- **The main job is installing Docker, kubectl, cloud CLIs, auth bootstrap, or making the machine runnable** → `system-environment-setup`
- **The main job is dashboards, alerts, traces, or long-lived telemetry architecture** → `monitoring-observability`
- **The main job is Vercel-specific linking, domains, aliases, environment variables, or claim URLs** → `vercel-deploy`
- **The system cannot build, package, or run tests yet** → fix build/setup problems before reopening deployment automation
- **The main job is secret rotation, IAM policy, signing, or compliance architecture** → route to the relevant security skill

## Instructions

### Step 1: Freeze the release profile
Normalize the request before suggesting steps.

```yaml
release_profile:
  mode: preview-release | environment-promotion | container-paas-rollout | kubernetes-rollout | rollback-response | release-hardening
  runtime_shape: static-frontend | web-app | api-service | worker-job | multi-service | unknown
  artifact_shape: platform-build | image | build-output | package | unknown
  target_environment: preview | staging | production | mixed | unknown
  promotion_model: same-artifact-promotion | rebuild-per-env | direct-deploy | unknown
  rollout_strategy: replace | rolling | blue-green | canary | progressive | feature-flag-assisted | unknown
  stateful_risk: low | medium | high | unknown
  verification_depth: health-only | smoke-tests | release-checklist | automated-analysis | unknown
```

Pick exactly one primary `mode` per run:
- `preview-release` — shareable verification before merge or promotion
- `environment-promotion` — staging → production or multi-env promotion with gates
- `container-paas-rollout` — managed app/container platform release planning
- `kubernetes-rollout` — rollout controller behavior, stop conditions, and rollback path
- `rollback-response` — bad deploy containment and recovery
- `release-hardening` — add missing preflight, approvals, or verification around an existing flow

### Step 2: Gather the smallest truthful evidence set
Do not invent a release flow from vibes. Capture the minimum real facts:
1. What artifact is actually being shipped?
2. Which environment is in scope right now?
3. Is the same artifact promoted across environments, or rebuilt per environment?
4. What is the current deploy command, provider action, or controller?
5. What health checks, smoke checks, or sign-off signals already exist?
6. What is the real rollback method?
7. Are there schema/data changes that make rollback asymmetric?

If any answer is unknown, state it explicitly and default to the smallest safe interpretation.

### Step 3: Enforce boundaries early
Use these route-outs before generating a packet:

| If the request is really about... | Route to |
|---|---|
| CI YAML, job graphs, reusable release workflows, task runners | `workflow-automation` |
| Docker/kubectl/cloud CLI installation, auth bootstrap, machine readiness | `system-environment-setup` |
| Dashboards, alerts, traces, log pipelines, SLO monitoring | `monitoring-observability` |
| Vercel project linking, aliases, domains, env vars, Vercel deploy mechanics | `vercel-deploy` |
| Secret rotation, IAM scope, signing, attestation, compliance evidence | security skill |
| Rollout choice, promotion gates, verification, rollback packet | `deployment-automation` |

### Step 4: Load the right support packet instead of expanding the front door
After classification, use the matching reference packet:
- `preview-release` → `references/release-packet-templates.md#preview-release-packet`
- `environment-promotion` → `references/release-packet-templates.md#environment-promotion-packet`
- `container-paas-rollout` → `references/release-packet-templates.md#containerpaas-rollout-packet`
- `kubernetes-rollout` → `references/release-packet-templates.md#kubernetes-rollout-packet`
- `rollback-response` → `references/release-packet-templates.md#rollback-response-packet`
- `release-hardening` → `references/release-packet-templates.md#release-hardening-packet`

Use `references/strategy-selection-and-stop-conditions.md` when choosing between replace / rolling / blue-green / canary / progressive paths.
Use `references/rollout-and-rollback-checklist.md` as the minimum release-safety checklist before finalizing.

### Step 5: Apply release-execution rules
- **Separate build from release.** A passing build does not prove the release is safe.
- **Separate deploy from exposure.** Traffic shifts, promotion gates, and feature flags may matter more than the initial deploy command.
- **Separate app rollback from data rollback.** Never imply they are the same.
- **Prefer the smallest rollout strategy that matches the team’s verification maturity.**
- **Prefer same-artifact promotion when reproducibility matters.** If the system rebuilds per env, call out the risk explicitly.
- **Verification is mandatory.** Health + one core flow is the minimum acceptable finish line.
- **Stop conditions beat optimism.** Name what should halt promotion or trigger rollback.

### Step 6: Produce a release packet, not a DevOps lecture
Your output should always include:

```markdown
# Release Packet
- Mode:
- Runtime / provider:
- Artifact:
- Environment(s):
- Promotion model:
- Rollout strategy:

## Preconditions
- Existing deploy path:
- Required auth/config:
- Known blockers / migrations:

## Steps
1. ...
2. ...
3. ...

## Verification
- Health checks:
- Smoke checks:
- Human/automatic sign-off:
- Stop conditions:

## Rollback / recovery
- Immediate rollback path:
- What rollback does not undo:

## Handoffs
- Adjacent skills or provider-specific follow-up:
```

### Step 7: Prefer hardening over wrapper proliferation
If the request feels like “deployment is messy,” prefer:
1. classify the release mode,
2. name the current source of truth,
3. add preflight / verification / rollback structure,
4. route platform detail to the correct adjacent skill.

Do **not** respond by inventing another generic deployment wrapper, re-explaining all of Kubernetes, or absorbing CI authoring into this skill.

## Output format
Return:
1. chosen release mode,
2. evidence gathered and unknowns,
3. rollout strategy with rationale,
4. verification plan,
5. rollback or recovery plan,
6. route-outs or remaining risks.

## Examples

### Example 1: Preview deploy confusion
Input: "Every PR gets a preview URL, but reviewers keep approving broken flows. What should the deployment process actually require before merge?"

Output shape: classify as `preview-release`, define what the preview proves, list smoke checks, and separate preview verification from later staging/prod promotion.

### Example 2: Staging to production promotion
Input: "We deploy to staging automatically, but production promotion is still a manual Slack ritual. Give us the safest release packet."

Output shape: classify as `environment-promotion`, name artifact and gates, require post-promote checks, and specify rollback plus schema caveats.

### Example 3: Failed production deploy
Input: "The latest release is timing out in production and it also included a migration. We need the safest rollback plan."

Output shape: classify as `rollback-response`, contain blast radius, separate app rollback from migration risk, and define post-recovery verification.

## Best practices
1. Keep the front door about release decisions, not platform encyclopedias.
2. Name the real artifact, environment, and rollback path before suggesting anything.
3. Prefer short release packets that an operator can run under pressure.
4. Route provider-specific and adjacent concerns out early.
5. Treat verification and stop conditions as required output, not optional polish.

## References
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Argo Rollouts](https://argo-rollouts.readthedocs.io/en/stable/concepts/)
- [Vercel Deployments](https://vercel.com/docs/deployments)
