---
name: system-environment-setup
description: >
  Build reproducible developer environments for real projects: local toolchains,
  runtime versions, Docker Compose or dev containers, onboarding flows, local
  service parity, bootstrap scripts, and environment troubleshooting. Use when the
  user needs a repo to run consistently across machines, containers, or staged
  environments, even if they only say setup dev environment, onboarding, Docker,
  devcontainer, local parity, bootstrap, or make this runnable. This is the
  canonical broader environment-setup skill. Route narrower `.env` and app-config
  questions to `environment-setup`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best when the task spans toolchains, local services, containers, onboarding,
  or cross-machine reproducibility. Use alongside `environment-setup` for
  application env files, env validation, and secret handoff details.
metadata:
  tags: environment-setup, reproducibility, devcontainers, docker-compose, onboarding, toolchains, local-parity
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.1"
  source: akillness/jeo-skills
---

# System & Environment Setup

Use this skill as the repository's **canonical broader environment-setup anchor**.

The job is to make a project **runnable and repeatable** across developer machines and environments.
That usually includes some mix of:
- runtime/tool version pinning,
- local services and containers,
- bootstrapping scripts,
- onboarding steps,
- local-prod parity tradeoffs,
- secrets/config handoff boundaries,
- setup diagnosis when automation drifts.

Read [references/operating-modes.md](references/operating-modes.md) and [references/scope-boundaries.md](references/scope-boundaries.md) before unusual cases or when deciding whether the task belongs here or in `environment-setup`.

If the user mainly needs:
- **`.env` structure, env precedence, validation, or framework-specific app config** → route to `environment-setup`
- **CI/CD pipelines and hosted deployment automation** → route to `deployment-automation` or `vercel-deploy`
- **security policy and secret-store architecture** → pair with `security-best-practices`
- **project slicing / onboarding checklist ownership** → pair with `task-planning`

## When to use this skill
- Make a repo runnable on a fresh machine with consistent tooling
- Standardize local dev setup across multiple contributors
- Choose between local-host, Docker Compose, devcontainers, or hybrid workflows
- Pin runtime/tool versions and reduce cross-machine drift
- Set up local supporting services like databases, caches, queues, or search
- Design bootstrap commands, setup checks, or onboarding flows
- Diagnose why local setup docs, scripts, containers, and actual runtime behavior have drifted apart
- Improve local parity without pretending local and production are identical

## When not to use this skill
- The main task is app-level `.env` organization, env schema validation, or framework env rules → use `environment-setup`
- The main task is production deployment, cloud rollout, or CI orchestration → use `deployment-automation`
- The main task is hosted infrastructure security review → pair with `security-best-practices`
- The task is just one package install with no broader environment decision surface → use a narrower install/setup skill when available

## Instructions

### Step 1: Classify the setup surface
Normalize the request into this intake first:

```yaml
environment_intake:
  primary_goal: runnable-local-repo | standardized-onboarding | local-service-parity | toolchain-reproducibility | setup-diagnosis | hybrid
  current_state: greenfield | partially-working | drifted | broken-on-new-machine | unknown
  runtime_shape: single-service | app-plus-services | microservices | unknown
  host_strategy: host-native | docker-compose | devcontainer | hosted-remote-dev | hybrid | unknown
  config_strategy: simple-env-files | typed-validation | secret-manager-injection | mixed | unknown
  main_pain:
    - missing-prereqs
    - runtime-version-drift
    - local-service-startup
    - secrets-bootstrap
    - onboarding-doc-rot
    - cross-platform-differences
    - local-prod-parity
    - unclear
  confidence: high | medium | low
```

If the request is ambiguous, prefer the broadest **runnable repo** interpretation and state the assumption.

### Step 2: Choose one primary operating mode
Pick exactly one mode for the run:

1. **bootstrap-and-onboarding**
   - Use when the repo needs a clean first-run path for contributors.
2. **toolchain-reproducibility**
   - Use when runtimes, CLIs, or package versions drift between machines.
3. **local-services-and-parity**
   - Use when local DB/cache/queue/search or app-plus-service topology is the main challenge.
4. **containerized-dev-environment**
   - Use when Docker Compose, devcontainers, or Codespaces-style flows are the main lever.
5. **setup-diagnosis-and-hardening**
   - Use when scripts, docs, containers, and actual behavior have drifted apart.

### Step 3: Pick the smallest reproducibility stack that solves the problem
Use these rules:
- Prefer the smallest stack that makes the repo reliably runnable.
- Use **runtime/version pinning** before introducing heavier containers if the repo is simple.
- Use **Docker Compose** when supporting services or shared local topology matter.
- Use **devcontainers** when editor/runtime standardization and onboarding speed matter more than host-native ergonomics.
- Keep **bootstrap scripts / Makefiles / task runners** as glue, not the only source of truth.
- Do not pretend local equals production; name the remaining parity gaps explicitly.
- Route app-level env file design and validation details to `environment-setup` instead of bloating this skill.

### Step 4: Build the environment plan
Return this exact structure:

```markdown
# Environment Setup Brief

## Recommended mode
- Mode: bootstrap-and-onboarding | toolchain-reproducibility | local-services-and-parity | containerized-dev-environment | setup-diagnosis-and-hardening
- Why this mode fits: ...

## Current setup surface
- Project shape: ...
- Host/container strategy: ...
- Config/secrets strategy: ...
- Main drift or blocker: ...
- Confidence: high | medium | low

## Recommended environment stack
1. ...
2. ...
3. ...

## Commands / files to create or verify
```bash
...
```

## Why this is the right level of setup
- ...
- ...

## Parity gaps to acknowledge
- ...
- ...

## Watch-outs
- ...
- ...

## Adjacent handoff
- Use `environment-setup` for ...
- Use `deployment-automation` for ...
- Use `security-best-practices` for ...
```

### Step 5: Apply mode-specific guidance

**For bootstrap-and-onboarding**
- Define the one clean happy path first.
- Separate prerequisites, secrets/bootstrap, and verification steps.
- Prefer a setup check (`make doctor`, `bin/setup --check`, etc.) when possible.

**For toolchain-reproducibility**
- Pin runtime versions explicitly.
- Choose one version-management layer per repo when possible.
- Call out cross-platform differences instead of hiding them.

**For local-services-and-parity**
- Name which services must run locally and which can stay remote.
- Prefer Docker Compose for shared service topology.
- Explain the local-prod gap instead of overselling parity.

**For containerized-dev-environment**
- Decide whether Compose, devcontainers, or both are necessary.
- Keep secrets/bootstrap out of committed container config unless clearly safe.
- State the editor or platform assumptions.

**For setup-diagnosis-and-hardening**
- Compare docs, bootstrap scripts, env templates, container files, and actual commands.
- Identify which artifact is authoritative.
- Reduce duplicate instructions and make verification explicit.

### Step 6: Keep boundaries sharp
Before finalizing:
- Do **not** bury `.env` / env validation details here when the real need belongs in `environment-setup`.
- Do **not** turn setup guidance into a cloud deployment tutorial.
- Do **not** claim total parity if auth, secrets, or platform quirks remain manual.
- Do **not** let bootstrap scripts become unexplained magic.

## Examples

### Example 1: Fresh repo onboarding
Input: "Set up this repo so a new developer can run it locally with the right Node version, Postgres, and Redis."
Output: chooses `bootstrap-and-onboarding`, recommends pinned runtime versions plus Compose for local services, and adds a verification path.

### Example 2: Containerized local standardization
Input: "Our team wants a devcontainer because everybody's local machine is different."
Output: chooses `containerized-dev-environment`, names which tooling should move into the container, and routes env-file details to `environment-setup`.

### Example 3: Drift diagnosis
Input: "The README says one thing, Docker says another, and new hires still can't run the app."
Output: chooses `setup-diagnosis-and-hardening`, compares setup artifacts, and identifies the authoritative source plus cleanup steps.

## Best practices
1. Optimize for a runnable repo, not maximal tooling sophistication.
2. Pick one canonical reproducibility story and make alternatives explicit.
3. Keep secrets/config guidance connected but not conflated with machine/runtime setup.
4. Add a verification step so onboarding is testable.
5. Name parity gaps instead of pretending containers solve everything.
6. Route narrower app-config questions to `environment-setup`.

## References
- [Scope boundaries](references/scope-boundaries.md)
- [Operating modes](references/operating-modes.md)
- [Docker Compose docs](https://docs.docker.com/compose/)
- [VS Code dev containers](https://code.visualstudio.com/docs/devcontainers/containers)
- [GitHub dev containers intro](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/introduction-to-dev-containers)
