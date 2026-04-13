# Workflow Automation Modes

Use this quick map when deciding what `workflow-automation` should own.

## 1. task-entrypoints
Use when the repo needs stable, memorable commands for recurring developer work.

Typical fit:
- `make dev`
- `just test`
- `npm run ci`
- `task lint`

Choose this mode when:
- humans invoke the commands often
- the main pain is command sprawl or poor discoverability
- the underlying tools already exist and only need a thin wrapper

Avoid this mode when the real problem is cloud deployment or machine provisioning.

## 2. bootstrap-onboarding
Use when first-run setup or repeated initialization is the main pain.

Typical fit:
- `scripts/bootstrap.sh`
- `make setup`
- `just bootstrap`

Guardrails:
- safe to rerun
- checks prerequisites first
- prompts are optional or avoided by default
- ends with a verification step

## 3. local-ci-parity
Use when developers need fast confidence before pushing.

Typical fit:
- `make ci`
- `task verify`
- `act` for a subset of GitHub Actions jobs

Guardrails:
- mirror the critical CI checks, not every hosted-runner detail
- name where local and hosted CI intentionally differ
- keep the command fast enough to use regularly

## 4. hook-guardrails
Use when the main need is local hygiene enforcement.

Typical fit:
- lint/format hooks
- fast unit checks
- secret scanning

Guardrails:
- keep hooks short and deterministic
- mirror policy in CI
- do not hide slow integration suites in hooks

## 5. repo-maintenance
Use when recurring chores are better handled by bots or schedules than by a developer typing commands.

Typical fit:
- dependency update bots
- scheduled cleanup jobs
- stale-issue handling
- release-note prep

Guardrails:
- define review/approval expectations
- keep bot noise under control
- separate maintenance automation from deployment rollout

## Choosing between modes
- If humans type the command often → start with `task-entrypoints`
- If new contributors are blocked → start with `bootstrap-onboarding`
- If CI failures are found too late → start with `local-ci-parity`
- If the main issue is commit-time hygiene → start with `hook-guardrails`
- If the work is scheduled or bot-driven → start with `repo-maintenance`
- If everything is messy and duplicated → start with `workflow-diagnosis`, then pick the new primary mode after cleanup
