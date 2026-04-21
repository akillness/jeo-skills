# System Environment Setup Boundaries

Use `system-environment-setup` when the real question is **how to make a repo runnable and repeatable across machines**.

It owns:
- runtime/tool version pinning
- local supporting services (DB, cache, queue, search)
- Docker Compose and hybrid local stacks
- devcontainers / Codespaces-style environment design
- bootstrap scripts and setup verification
- onboarding and setup-drift diagnosis

## Route away when the need changes

### App config / `.env` design
Use `environment-setup` when the real question is:
- how should `.env` files be structured?
- which vars belong in templates vs local-only files?
- how do we validate env vars?
- how do we handle framework-specific public/private env behavior?

### Deployment and CI
Use `deployment-automation` when the real question is:
- how do we deploy or promote environments?
- how do CI/CD pipelines inject config or secrets?
- how do we automate rollout and infrastructure changes?

### Security policy
Use `security-best-practices` when the real question is:
- what is the correct secret-management policy?
- how should credentials be rotated or scoped?
- what is the security architecture for env/config handling?

## Core rule
`system-environment-setup` owns the **runnable local environment**.
It should not absorb every app-config or deployment concern that happens to sit nearby.
