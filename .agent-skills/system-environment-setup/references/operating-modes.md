# System Environment Setup Operating Modes

## 1. bootstrap-and-onboarding
Use when the repo needs a clean first-run path.

Typical ingredients:
- prerequisite list
- version manager or pinned runtime file
- bootstrap script / task runner
- local env template handoff
- verification command (`make doctor`, `bin/setup --check`, smoke test)

## 2. toolchain-reproducibility
Use when the main drift is runtime versions or local CLIs.

Typical ingredients:
- `.tool-versions`, `mise.toml`, or equivalent
- install/verify commands
- cross-platform notes
- minimal shell activation guidance

## 3. local-services-and-parity
Use when the app depends on databases, caches, queues, or search.

Typical ingredients:
- Docker Compose or equivalent
- service startup/health-check commands
- note of what remains remote
- explicit parity gaps

## 4. containerized-dev-environment
Use when you need standardized editor/runtime environments.

Typical ingredients:
- devcontainer or remote-dev config
- editor assumptions
- secrets/bootstrap boundary
- container vs host workflow notes

## 5. setup-diagnosis-and-hardening
Use when the setup already exists but drifts.

Typical comparison set:
- README / onboarding docs
- env templates
- bootstrap scripts
- Compose or devcontainer files
- actual commands contributors run
