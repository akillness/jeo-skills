---
name: deployment-automation
description: >
  Plan and execute hosted deployment and rollout automation for web, backend, and
  fullstack systems: preview/staging/prod promotion, release verification,
  rollback planning, provider handoff, and deployment runbooks. Use when the main
  job is shipping a built artifact or service safely to an environment, choosing a
  rollout strategy, or tightening deploy/release steps around health checks and
  promotion rules. Triggers on: deployment automation, deploy pipeline, release
  rollout, staging to prod, preview environment, canary, blue-green, rollback,
  post-deploy verification, and release promotion. Route CI workflow authoring to
  `workflow-automation`, machine/runtime setup to `system-environment-setup`,
  ongoing dashboards/alerts to `monitoring-observability`, and Vercel-specific
  operations to `vercel-deploy`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for repositories or delivery workflows where the system can already build
  and the main problem is safely promoting, deploying, verifying, or rolling back
  a release across preview, staging, and production environments.
license: MIT
metadata:
  tags: deployment, release-rollout, preview-environments, rollback, progressive-delivery, post-deploy-verification, devops
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0.0"
  modernization: 2026-04-13
  source: akillness/oh-my-skills
---

# Deployment Automation

Use this skill when the main job is **getting an already-buildable system safely into an environment and proving the rollout worked**.

`deployment-automation` is the infrastructure/dev-workflow anchor for:
- preview, staging, and production deployment flows
- release promotion and environment gates
- rollout strategy choice: replace, rolling, blue-green, canary, progressive
- deployment preflight and post-deploy verification
- rollback planning and bad-release containment
- provider handoff across static hosts, container PaaS, Kubernetes, and generic CI-driven deploy paths

Read these support docs before choosing the mode or boundary:
- [references/deployment-modes-and-boundaries.md](references/deployment-modes-and-boundaries.md)
- [references/rollout-and-rollback-checklist.md](references/rollout-and-rollback-checklist.md)
- [references/platform-routing-notes.md](references/platform-routing-notes.md)

## When to use this skill
- A team needs a safe deploy/runbook path for preview, staging, or production
- A release flow needs preflight checks, promotion gates, smoke checks, and rollback rules
- The question is whether to use direct deploy, rolling, blue-green, canary, or progressive delivery
- A project already has buildable artifacts, but release execution is still a mix of tribal knowledge and shell history
- The deploy path needs clearer separation between preview deploys, staging promotion, and production rollout
- A deployment failed and the next job is to verify, stop, or roll back rather than redesign the whole observability stack
- The user needs a vendor-neutral release packet before using Vercel, Render, Fly.io, Kubernetes, or a CI-driven provider path

## When not to use this skill
- **The main job is authoring or refactoring GitHub Actions / GitLab / Jenkins / Buildkite workflows, task runners, or repo-local release glue** → use `workflow-automation`
- **The main job is installing CLIs, Docker, kubectl, cloud SDKs, auth bootstrap, or making the machine runnable** → use `system-environment-setup`
- **The main job is long-lived dashboards, alerts, traces, metrics, log pipelines, or incident telemetry architecture** → use `monitoring-observability`
- **The main job is Vercel-specific project linking, domains, aliases, or Vercel environment settings** → use `vercel-deploy`
- **The main job is secret rotation, IAM policy, supply-chain hardening, or compliance evidence design** → route to the relevant security skill
- **The system cannot even build or package successfully yet** → fix build/test/setup problems before reopening deployment automation

## Instructions

### Step 1: Classify the deployment job before touching commands
Normalize the request into one primary mode.

```yaml
deployment_mode:
  primary_mode: preview-release | environment-promotion | container-paas | kubernetes-rollout | rollback-response | release-hardening
  runtime_shape: static-frontend | web-app | api-service | worker-job | multi-service | unknown
  artifact_shape: platform-build | image | build-output | package | unknown
  target_environment: preview | staging | production | mixed | unknown
  promotion_model: direct-deploy | same-artifact-promotion | rebuild-per-env | unknown
  rollout_strategy: replace | rolling | blue-green | canary | progressive | unknown
  stateful_risk: low | medium | high | unknown
  verification_depth: health-only | smoke-tests | release-checklist | automated-analysis | unknown
```

Choose exactly one primary mode per run:
- `preview-release` → branch/PR deploys, preview URLs, and pre-merge verification
- `environment-promotion` → staging → production or multi-env promotion with gates
- `container-paas` → Render/Fly/railway-style or generic image/container-based releases
- `kubernetes-rollout` → deployments driven by Helm/Kustomize/Argo/Kubernetes rollout mechanics
- `rollback-response` → contain a bad deploy, restore service, and document the next safe action
- `release-hardening` → add missing preflight, approvals, smoke tests, or release packet structure around an existing deploy path

### Step 2: Confirm the real source of truth and boundary skills
Before prescribing steps, answer these questions:
1. What artifact is actually being shipped: platform build, image, bundle, or unknown?
2. Which environment is in scope right now: preview, staging, or production?
3. Is the same artifact promoted across environments, or rebuilt per env?
4. What is the rollback method: redeploy prior artifact, traffic switchback, platform rollback, or manual recovery?
5. Which neighboring skill really owns the unsolved part?

Quick route-out table:

| If the request sounds like... | Use |
|---|---|
| "Set up or rewrite the deploy workflow YAML / task runner / release scripts" | `workflow-automation` |
| "Install Docker / kubectl / cloud CLI / authenticate this machine" | `system-environment-setup` |
| "Set up dashboards, alerts, traces, or SLOs" | `monitoring-observability` |
| "Deploy this site/app specifically to Vercel" | `vercel-deploy` |
| "Handle secret rotation, IAM scopes, signing, or compliance controls" | security skill |
| "Pick rollout strategy, promotion gates, verification, and rollback plan" | `deployment-automation` |

### Step 3: Gather the smallest truthful evidence set
Do not improvise a production release flow from vibes. Pull the minimum credible facts first:
- current deploy target and provider/runtime
- current build artifact or packaging output
- environment names and promotion order
- existing deploy command / platform action / release job
- required secrets/config already expected by the release path
- health endpoint, smoke checks, or verification commands
- rollback capability and its limitations
- whether database/schema changes are part of this release

If these are incomplete, state the gaps and default to the smallest safe interpretation.

### Step 4: Choose the deployment mode packet
Use the smallest packet that fits the job.

#### A. Preview release
Use when the main need is shareable verification before prod.

Recommended skeleton:
```markdown
# Preview Release Packet

## Target
- Provider/runtime:
- URL/output:
- What reviewers should verify:

## Preconditions
- Build/test status:
- Required config present:

## Deploy steps
1. ...
2. ...
3. ...

## Verification
- Smoke checks:
- Visual / flow checks:
- Promote or discard decision:
```

#### B. Environment promotion
Use when staging → production is the real job.

Recommended skeleton:
```markdown
# Environment Promotion Packet

## Artifact and environments
- Artifact:
- Promote from:
- Promote to:
- Promotion model:

## Gates
- Required approvals:
- Freeze/change-window notes:
- Blocking risks:

## Verification
- Before promote:
- After promote:

## Rollback
- Immediate rollback path:
- Data/schema caveats:
```

#### C. Container/PaaS rollout
Use for managed app/container platforms.

Recommended skeleton:
```markdown
# Container/PaaS Rollout Packet

## Runtime
- Image/build source:
- Platform:
- Release command:

## Release plan
- Direct deploy or staged:
- Release checks:
- Rollback path:

## Handoffs
- Provider-specific follow-up:
- Adjacent skills if needed:
```

#### D. Kubernetes rollout
Use when rollout strategy and cluster behavior are central.

Recommended skeleton:
```markdown
# Kubernetes Rollout Packet

## Delivery surface
- Manifest source:
- Deployment/controller:
- Strategy:

## Preflight
- Image/tag:
- Namespace/env:
- Migration/secrets assumptions:

## Rollout
- Apply/promote steps:
- Health and readiness checks:
- Stop conditions:

## Rollback
- Previous ReplicaSet/version:
- Traffic/data caveats:
```

#### E. Rollback response
Use when something already went wrong.

Recommended skeleton:
```markdown
# Rollback Response Packet

## Failure signal
- What failed:
- Blast radius:
- Confidence:

## Immediate containment
1. ...
2. ...
3. ...

## Recovery path
- Redeploy previous artifact / switch traffic / disable flag:
- Data/schema caveats:

## Verification after recovery
- Health:
- Smoke:
- Follow-up hardening:
```

### Step 5: Apply release-execution rules instead of generic DevOps advice
Use these rules aggressively:
- **Separate build from release.** The job is not done because a build passed.
- **Separate deploy from release.** Feature flags, traffic shifts, and staged exposure are often safer than one big launch.
- **Separate app rollback from data/schema rollback.** Never imply they are the same.
- **Prefer the smallest rollout strategy that matches risk.** Do not prescribe canary/progressive delivery if the team lacks verification maturity.
- **Prefer same-artifact promotion when reproducibility matters.** If the system rebuilds per env, call out the risk explicitly.
- **Treat verification as mandatory.** A deploy without health/smoke checks is not complete.
- **Treat rollback as a real workflow, not a slogan.** Name the exact path and its caveats.
- **Prefer existing project commands and platform entrypoints over invented shell theater.**

### Step 6: Choose the right strategy
Use this ladder:

#### Use direct replace when
- the system is low-risk or non-critical
- rollback is easy
- downtime or small blast radius is acceptable

#### Use rolling updates when
- the runtime supports gradual replacement
- health/readiness checks are credible
- the goal is zero-downtime replacement without dual-stack complexity

#### Use blue/green when
- traffic switching between old/new versions is possible
- fast rollback via traffic reversal matters
- infra cost and environment duplication are acceptable

#### Use canary/progressive delivery when
- the release is high-risk
- the team has trustworthy metrics or smoke checks
- stop conditions and rollback ownership are explicit

#### Use feature-flag-assisted release when
- deployment and user-visible exposure should be decoupled
- the code can ship dark before broad release
- rollback by flag disable is safer than full app rollback

### Step 7: Keep deployment honest about adjacent concerns
A strong deployment packet says what it does **not** own.

Examples:
- if the pain is creating the GitHub Actions job, route to `workflow-automation`
- if the pain is missing CLIs/auth/local Docker setup, route to `system-environment-setup`
- if the pain is lacking dashboards or alerts to verify rollout health, route to `monitoring-observability`
- if the task is provider-specific Vercel operations, route to `vercel-deploy`
- if the task is secrets/IAM/compliance, route to security-specific skills

Mixed requests are common. Split them explicitly instead of letting one skill become “all DevOps.”

### Step 8: Produce the deployment automation packet
Always return a packet another engineer or agent can execute or review.

Preferred format:
```markdown
# Deployment Automation Packet

## Mode
- Primary mode:
- Why this mode fits:

## Target and artifact
- Runtime/provider:
- Environment(s):
- Artifact/build source:
- Promotion model:

## Preconditions
- Build/test status:
- Required config/auth already present:
- Blocking risks:

## Rollout steps
1. ...
2. ...
3. ...

## Verification
- Health checks:
- Smoke checks:
- Manual sign-off if needed:

## Rollback
- Immediate rollback path:
- Data/schema caveats:

## Handoffs
- Route to neighboring skills:
- Remaining risks:
```

### Step 9: Prefer hardening over platform sprawl
When modernizing an existing deploy flow:
- add missing preflight and verification before switching platforms
- simplify environment naming and promotion order before adding more tools
- make rollback explicit before adding progressive-delivery buzzwords
- keep provider-specific steps in support docs or neighboring skills, not the core description
- preserve transferable logic that works across frontend, backend, and fullstack release flows

## Output format
Always return a **deployment automation packet**, **rollout hardening brief**, or **rollback response packet**.

Required qualities:
- classify the deployment job before prescribing tools
- name the runtime/provider and environment model explicitly
- separate build, promotion, verification, and rollback
- call out route-outs and scope boundaries
- identify whether the same artifact is promoted or rebuilt per environment
- treat verification and rollback as first-class, not optional notes

## Examples

### Example 1: Staging to production promotion
**Input**
> We can already deploy to staging, but production releases are still a manual checklist in Slack. What should we automate first?

**Good output direction**
- mode: `environment-promotion`
- keep existing build artifact, add explicit preflight and post-deploy verification
- require approval + production health checks
- name rollback path and data caveats
- route workflow-YAML refactors to `workflow-automation`

### Example 2: Preview env confusion
**Input**
> Every PR creates a preview site, but no one knows what to verify before merge.

**Good output direction**
- mode: `preview-release`
- define what preview proves and what still requires staging/prod verification
- add a reviewer checklist and discard/promotion rule
- route provider-specific details to `vercel-deploy` or the relevant platform skill

### Example 3: Failed production rollout
**Input**
> The new release is timing out in production. We need the safest rollback plan.

**Good output direction**
- mode: `rollback-response`
- identify failure signal and blast radius
- contain first, then restore last known good version or traffic path
- separate app rollback from data/schema recovery
- include post-recovery verification and hardening follow-up

## Best practices
1. Prefer release-execution clarity over giant provider-specific command dumps.
2. Keep deployment, promotion, verification, and rollback as separate named stages.
3. Avoid pretending every team needs canary/progressive delivery; match strategy to verification maturity.
4. Treat stateful changes, migrations, and schema compatibility as explicit risk multipliers.
5. Route setup, CI authoring, monitoring architecture, and security governance outward instead of bloating this skill.

## References
- [references/deployment-modes-and-boundaries.md](references/deployment-modes-and-boundaries.md)
- [references/rollout-and-rollback-checklist.md](references/rollout-and-rollback-checklist.md)
- [references/platform-routing-notes.md](references/platform-routing-notes.md)
