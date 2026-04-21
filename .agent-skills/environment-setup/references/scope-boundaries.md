# Environment Setup Boundaries

Use `environment-setup` when the real question is **application configuration**.

It owns:
- `.env` template structure
- env precedence and local-only overrides
- typed env validation
- public/private env variable boundaries
- secret handoff documentation
- config drift cleanup across local, CI, staging, and production

## Route away when the need changes

### Runnable local machines and containers
Use `system-environment-setup` when the real question is:
- how do I get the repo running on a fresh machine?
- should we use Docker Compose or devcontainers?
- how do we standardize toolchains and local services?
- why does onboarding still fail even with env templates?

### Deployment automation
Use `deployment-automation` when the real question is:
- how are values injected in CI/CD or production?
- how do we wire cloud deployments, previews, or hosted environments?

### Security architecture
Use `security-best-practices` when the real question is:
- should we adopt a secret manager?
- how should secret access and rotation work?
- what security posture should config handling follow?

## Core rule
`environment-setup` owns the **app-config layer**.
It should not masquerade as the whole runnable-environment playbook.
