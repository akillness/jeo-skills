---
name: workflow-automation
description: >
  Design repo-scoped recurring workflow automation: task runners, bootstrap
  entrypoints, local-CI parity commands, hook guardrails, and maintenance
  routines that wrap existing tools without bloating into full deployment or
  environment provisioning. Use when the user needs repeatable commands for
  setup/build/test/lint/release prep, wants to replace copy-paste shell rituals,
  or must choose between npm scripts, Make/just/Task, hooks, local CI mirrors,
  and repo maintenance bots. Triggers on: workflow automation, task runner,
  make this repeatable, bootstrap script, make/just/taskfile, local CI parity,
  repo automation, and recurring dev workflow.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for CLI/dev workflow, backend, frontend, and fullstack repositories where
  the problem is recurring repo-local workflows or repo-plus-CI command
  orchestration. Not for cloud deployment architecture, broad machine
  provisioning, or local Git history management.
license: MIT
metadata:
  tags: automation, task-runner, bootstrap, ci-parity, dev-workflow, hooks, repo-maintenance
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Workflow Automation

Use this skill when the main question is **"what is the smallest repeatable automation layer this repo needs, and how should it wrap the tools we already have?"**

The job is not to dump a giant Makefile, ten shell scripts, and a random GitHub Actions example.
The job is to:
1. classify the recurring workflow,
2. choose the right automation surface,
3. keep repo-local glue separate from environment provisioning and deployment,
4. make automation idempotent and non-interactive,
5. return a workflow packet another engineer or agent can apply immediately.

Read [references/automation-modes.md](references/automation-modes.md) before designing or refactoring a workflow layer.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `workflow-automation`, `system-environment-setup`, `deployment-automation`, `git-workflow`, `testing-strategies`, or `monitoring-observability` should own the next step.

## When to use this skill
- Turn repeated repo commands into one stable entrypoint instead of copy-paste shell history
- Choose between `npm scripts`, Make, `just`, Task, shell scripts, hooks, or CI wrappers
- Design or refactor bootstrap flows like `make setup`, `just bootstrap`, `npm run ci`, or `scripts/bootstrap.sh`
- Reduce drift between local commands, docs, and CI expectations
- Decide what belongs in task runners versus hooks versus hosted CI
- Add repo-maintenance automation like dependency update bots or scheduled housekeeping without confusing that with deployment
- Diagnose why a workflow layer has become brittle, interactive, duplicated, or impossible to onboard with

## When not to use this skill
- **The main task is runtime/toolchain installation, Docker Compose topology, devcontainers, or making a repo runnable across machines** → use `system-environment-setup`
- **The main task is cloud/server deployment, release rollout, Docker/Kubernetes delivery, or hosted CI/CD architecture** → use `deployment-automation` or `vercel-deploy`
- **The main task is local branch/commit/rebase/recovery workflow** → use `git-workflow`
- **The main task is deciding risk-based test depth or merge/release evidence policy** → use `testing-strategies`
- **The main task is production alerting, telemetry, or dashboards** → use `monitoring-observability`
- **The commands are already clear and the only job is trivial implementation**; in that case implement directly instead of reopening the automation design

## Instructions

### Step 1: Classify the recurring workflow before choosing tools
Normalize the request into this intake first:

```yaml
workflow_intake:
  primary_goal: task-entrypoints | bootstrap-onboarding | local-ci-parity | hook-guardrails | repo-maintenance | workflow-diagnosis | hybrid
  repo_shape: single-app | app-plus-services | monorepo | library-cli | docs-content | unknown
  current_surface: package-scripts | make-just-task | shell-scripts | ci-workflows | hooks | mixed | none | unknown
  main_pain:
    - command-sprawl
    - onboarding-drift
    - local-vs-ci-mismatch
    - interactive-script
    - cross-platform-friction
    - duplicated-logic
    - hidden-maintenance-chores
    - unclear-owner
    - unknown
  blast_radius: local-dev-loop | repo-plus-ci | multi-team-repo | unknown
  confidence: high | medium | low
```

If the user is vague, prefer the smallest obvious **repo-local recurring workflow** interpretation and state the assumption.

### Step 2: Choose one primary automation mode
Pick exactly one mode for the current run:

1. **task-entrypoints**
   - Use when the repo needs stable command names for build/test/lint/dev/format/package tasks.
2. **bootstrap-onboarding**
   - Use when first-run setup or contributor onboarding is the main pain.
3. **local-ci-parity**
   - Use when the team needs a fast local command that mirrors CI expectations without pretending it is identical to hosted CI.
4. **hook-guardrails**
   - Use when the main need is fast local policy enforcement before commit or push.
5. **repo-maintenance**
   - Use when the recurring work is dependency updates, scheduled cleanup, or routine repo housekeeping.
6. **workflow-diagnosis**
   - Use when scripts/docs/CI have drifted and the main job is to simplify, dedupe, and reassign ownership.

### Step 3: Choose the smallest automation surface that solves the problem
Use these rules:

- Prefer a **thin entrypoint layer** over a giant automation platform when the workflow is repo-scoped.
- Prefer **package scripts / Make / just / Task** for human-invoked recurring commands.
- Prefer **hooks** for fast local guardrails only; do not hide slow or flaky workflows there.
- Prefer **hosted CI** for branch/release enforcement, cross-platform matrices, or scheduled automation that must run without a developer laptop.
- Prefer **local CI mirror commands** (`make ci`, `npm run ci`, `act`) when the problem is feedback speed, not platform replacement.
- Keep **bootstrap scripts idempotent and non-interactive**; prompt-free scripts age better in CI, containers, and automated agents.
- Do not let repo automation silently absorb broader system provisioning or deployment architecture.

### Step 4: Apply the decision ladder
Use this ladder when multiple automation surfaces compete:

#### Use task runners when
- the workflow is developer-invoked and happens often
- the team needs memorable commands like `make dev`, `just test`, or `npm run ci`
- the underlying tools already exist and only need a stable wrapper
- the repo needs one discoverable command surface more than a new platform

#### Use bootstrap scripts when
- first-run setup, seed data, codegen, or repeated initialization steps are the main pain
- the workflow must perform checks before acting
- the command should be safe to re-run after partial failure or branch switches

#### Use hooks when
- the checks are fast, deterministic, and tightly tied to commit/push hygiene
- the team wants fast feedback for lint/format/secret scanning/basic tests
- the same rule is also mirrored in CI so local bypass does not become policy drift

#### Use local-CI wrappers when
- developers need pre-push confidence or faster iteration on CI failures
- the workflow should mirror core CI commands without copying every hosted-runner detail
- the team benefits from `make ci` / `task ci` / `act` as a repo-local feedback loop

#### Use maintenance automation when
- the repeated work is dependency updates, release notes prep, stale-issue cleanup, or scheduled housekeeping
- the work benefits from bots or scheduled jobs more than human-invoked commands
- the repo needs an owner and review policy for the automation outputs

### Step 5: Keep automation honest about boundaries
A strong workflow layer says what it does **not** own.

Examples:
- if the real pain is machine provisioning, runtime pinning, local services, or devcontainers, route to `system-environment-setup`
- if the real pain is deployment rollout or hosted CI/CD topology, route to `deployment-automation`
- if the real pain is deciding test depth or flaky-suite policy, route to `testing-strategies`
- if the real pain is Git history shaping or push safety, route to `git-workflow`

Mixed requests are common. Split them explicitly instead of pretending one skill should own the entire developer platform.

### Step 6: Enforce reusable automation guardrails
Any recommended workflow automation should satisfy these rules:

- **Idempotent** — safe to re-run after partial success or interrupted setup
- **Non-interactive by default** — use flags/env/config instead of prompts whenever possible
- **Discoverable** — one obvious entrypoint and consistent names
- **Thin** — wrap existing tools instead of re-implementing every build/test/deploy detail
- **Documented** — command purpose, prerequisites, and route-outs are clear
- **Verifiable** — easy to prove locally or in CI that the automation still works

Bad smells:
- shell prompts inside bootstrap scripts
- duplicate command logic spread across README, Makefile, CI YAML, and ad hoc scripts
- hooks running slow/flaky suites that developers immediately bypass
- task runners that secretly own cloud deployment or local machine provisioning

### Step 7: Produce the workflow automation packet
Return a concise artifact someone can act on immediately.

Preferred format:
```markdown
# Workflow Automation Packet

## Mode
- Primary mode:
- Why this mode fits:

## Recommended surfaces
- Human entrypoint:
- Supporting scripts / hooks / CI jobs:
- What stays out of scope:

## Command map
1. command → purpose
2. command → purpose
3. command → purpose

## Guardrails
- Idempotency:
- Non-interactive behavior:
- Docs/source-of-truth rules:
- Verification:

## Handoffs
- Route to neighboring skills:
- Remaining risks or follow-up work:
```

### Step 8: Prefer simplification over automation sprawl
When modernizing an existing workflow layer:
- collapse duplicate commands that do the same thing under different names
- keep a thin wrapper around real tools instead of embedding giant scripts inline
- name where CI and local commands intentionally differ
- reduce magic and hidden state before adding more automation
- preserve transferable patterns that work across CLI, backend, frontend, and fullstack repos

## Output format
Always return a **workflow automation packet**, **repo command map**, or **automation hardening brief**.

Required qualities:
- classify the workflow before prescribing tools
- choose one primary automation mode
- recommend the smallest useful surface
- name route-outs and boundaries explicitly
- include idempotency and non-interactive guardrails
- separate local command layers from hosted CI, deployment, and environment provisioning

## Examples

### Example 1: Too many repo commands
**Input**
> This repo has README commands, a half-used Makefile, and random `scripts/*.sh`. How should we clean this up?

**Good output direction**
- mode: `workflow-diagnosis`
- keep one human-facing entrypoint layer (`make` or `just`)
- move imperative logic into a few named scripts only where reuse matters
- define one source of truth for what local, hook, and CI commands call
- route machine provisioning concerns to `system-environment-setup`

### Example 2: Local CI parity
**Input**
> Developers keep pushing just to see CI fail. What should our workflow automation look like?

**Good output direction**
- mode: `local-ci-parity`
- add one `ci` entrypoint that runs the critical local checks
- keep hosted CI as the enforcement layer
- call out where local parity stops because secrets, images, or service topology differ
- route test-depth policy questions to `testing-strategies`

### Example 3: Bootstrap pain for contributors
**Input**
> New contributors need five manual setup steps, seed data, and a local service before they can run tests.

**Good output direction**
- mode: `bootstrap-onboarding`
- recommend one idempotent bootstrap entrypoint plus prerequisite checks
- keep prompts out of the default path
- route service topology/runtime provisioning to `system-environment-setup` if it becomes the main problem
- define a short verification command so onboarding can prove success

## Best practices
1. Start from the repeated workflow, not from a favorite automation tool.
2. Prefer the smallest repo-scoped layer that removes copy-paste rituals.
3. Keep command names memorable and consistent across docs and CI.
4. Treat interactive prompts as a last resort; they break automation quickly.
5. Hooks should be fast guardrails, not hidden integration test suites.
6. If local and CI differ, name the difference instead of pretending parity is perfect.
7. Automation that nobody can discover or verify is just hidden toil.
8. When in doubt, simplify and dedupe before adding another wrapper.
9. Route environment provisioning and deployment architecture to their own skills.
10. A short command map plus explicit boundaries beats a giant kitchen-sink automation tutorial.

## References
- [Task: The Modern Task Runner](https://taskfile.dev/)
- [Just Programmer's Manual](https://just.systems/man/en/)
- [mise tasks](https://mise.jdx.dev/tasks/)
- [pre-commit](https://pre-commit.com/)
- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [act documentation](https://nektosact.com/)
- [Development containers](https://containers.dev/)
