# Deployment Modes and Boundaries

## Purpose
Use this note to keep `deployment-automation` focused on release execution instead of expanding into every adjacent DevOps concern.

## Primary modes

### 1. Preview release
Use when the output is a shareable preview deployment or pre-merge release candidate.

Good fit:
- PR or branch preview deploys
- reviewer checklists for preview URLs
- deciding what a preview proves vs what still requires staging/prod verification

Route out when:
- the real job is provider-specific Vercel setup → `vercel-deploy`
- the real job is GitHub Actions / pipeline design → `workflow-automation`

### 2. Environment promotion
Use when the same release moves through staging → prod or across multiple environments.

Good fit:
- promotion gates and approvals
- artifact-promotion policy
- release checklist and sign-off logic
- post-promote health checks

Route out when:
- the environment/runtime itself is not set up yet → `system-environment-setup`

### 3. Container/PaaS rollout
Use when the service already packages into an image/build artifact and the release target is a managed platform.

Good fit:
- release path for Render/Fly/Railway-like platforms
- release checks, rollback notes, provider handoff

Route out when:
- the task is deep provider-specific product usage rather than generic release structure

### 4. Kubernetes rollout
Use when manifests/controllers/rollout strategy are the main concerns.

Good fit:
- rolling / blue-green / canary rollout planning
- readiness/health stop conditions
- Argo/Helm/Kustomize handoff notes

Route out when:
- the job is cluster bootstrap, CLI install, auth, or infra provisioning
- the job is ongoing monitoring/alerting architecture

### 5. Rollback response
Use when a release already failed and the job is safe containment and recovery.

Good fit:
- identifying blast radius
- choosing redeploy / switchback / flag-disable path
- separating app rollback from data/schema caveats

## Boundary rules

### `deployment-automation` owns
- selecting rollout/promotion mode
- deploy preflight
- immediate post-deploy verification
- rollback path definition
- release packet creation and handoff

### `deployment-automation` does not own
- CI workflow authoring → `workflow-automation`
- machine/runtime/tool installation → `system-environment-setup`
- dashboards, alerts, traces, log pipelines → `monitoring-observability`
- secret rotation / IAM / compliance architecture → security skills
- narrow Vercel operational detail → `vercel-deploy`

## Structural red flags
If the recommendation starts to include any of these, it is drifting out of scope:
- a full GitHub Actions tutorial
- Docker/kubectl/cloud-CLI installation steps
- a full observability stack setup
- secret storage architecture design
- a huge Kubernetes manifest cookbook with no release packet

## Useful phrasing
- "This skill assumes the system can already build."
- "The primary job is safe release execution, not CI authoring or machine setup."
- "Verification and rollback are required stages, not optional notes."
- "If the deploy target is specifically Vercel, route provider-specific detail to `vercel-deploy`."
