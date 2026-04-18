# Mode Packets and Route-outs

Use this sheet after choosing the primary `workflow-automation` mode.

## 1. task-entrypoints
**Use when** humans need one memorable command surface for repeated repo work.

Return:
- one human-facing surface (`package.json` scripts, `Makefile`, `justfile`, or `Taskfile.yml`)
- 3-6 named entrypoints (`setup`, `dev`, `test`, `lint`, `verify`, `ci` as needed)
- the source-of-truth rule for underlying scripts
- route-outs for environment or deployment concerns that should not be hidden behind the entrypoints

Watch-outs:
- too many synonyms for the same job (`check`, `verify`, `validate`, `ci` all meaning different things)
- task runners quietly owning deployment or machine setup

## 2. bootstrap-onboarding
**Use when** the main pain is first-run setup or repeated repo initialization.

Return:
- one idempotent bootstrap command
- prerequisite checks before mutation
- optional flags/env for non-interactive behavior
- one verification command proving the bootstrap succeeded
- route-out if local services, Docker/devcontainers, or machine-level provisioning become the real blocker

Watch-outs:
- shell prompts in the default path
- setup logic duplicated across docs, shell scripts, and CI
- hidden state that breaks after branch switches or partial failure

## 3. local-ci-parity
**Use when** developers need faster feedback than pushing to hosted CI.

Return:
- one local verification command (for example `make ci`, `task verify`, `npm run ci`)
- the critical checks it mirrors
- explicit parity limits (secrets, services, OS matrix, heavy integration environments)
- hosted CI remains the enforcement layer

Watch-outs:
- pretending local parity equals full hosted CI
- cloning CI YAML complexity into local shell scripts
- adding a slow command nobody will run

## 4. hook-guardrails
**Use when** commit-time hygiene is the main problem.

Return:
- hook surface (`pre-commit`, Husky, lefthook, or raw Git hooks)
- fast checks only: format, lint, secret scan, lightweight tests
- CI mirror rule for anything that truly matters
- contributor escape-hatch note if hooks are optional or bypassable

Watch-outs:
- slow hooks that train contributors to skip them
- hooks running large integration suites
- hook configs becoming the only place workflow logic lives

## 5. repo-maintenance
**Use when** the repeated work is better handled by schedules or bots.

Return:
- whether the job belongs in Dependabot, Renovate, scheduled CI, or a repo script called by automation
- review cadence / batching rules
- ownership policy (who reviews, who merges, what can auto-close or auto-merge)
- noise-control rules

Watch-outs:
- maintenance PR floods with no owner
- mixing daily developer commands and scheduled chores into one mushy surface
- assuming automation eliminates the need for human triage

## 6. workflow-diagnosis
**Use when** the repo has too many front doors already.

Return:
- the current surfaces in play (README, scripts, task runner, hooks, CI, bots)
- what should remain the human-facing front door
- what should move into underlying scripts/config
- what should be deleted, deduped, or renamed
- the steady-state mode after cleanup

Watch-outs:
- preserving redundant names because they are familiar
- adding another wrapper before deleting the broken ones
- letting CI remain the only discoverable source of truth

## Route-out map
| If the main job is... | Route to... | Why |
|---|---|---|
| machine setup, toolchain pinning, local services, devcontainers | `system-environment-setup` | broader environment reproducibility, not just repo command glue |
| rollout, environments, deployment strategy, production promotion | `deployment-automation` / `vercel-deploy` | release execution is downstream of repo-local workflows |
| branch strategy, rebase, conflict recovery, push safety | `git-workflow` | Git collaboration mechanics are separate from task-runner design |
| deciding test depth, merge gates, flaky-suite policy | `testing-strategies` | policy differs from command exposure |
| runtime telemetry, dashboards, alerting | `monitoring-observability` | runtime operations are outside repo automation |
| active failure/root-cause debugging | `debugging` | diagnose first, then automate the fix if it becomes recurring |

## Simple default
If you are unsure, start with:
1. identify the repeated repo-local task,
2. choose one primary mode,
3. propose one human-facing front door,
4. keep everything else as supporting automation with explicit boundaries.
