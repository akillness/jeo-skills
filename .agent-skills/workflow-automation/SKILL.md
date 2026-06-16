---
name: workflow-automation
description: >
  Routing-first skill for repo-scoped recurring workflow automation: task-entrypoint
  design, bootstrap/onboarding commands, local-CI parity wrappers, hook guardrails,
  maintenance bots, and workflow-diagnosis cleanup. Use when the user needs one
  repeatable repo command surface, must choose between package scripts / Make / just /
  Task / hooks / CI wrappers / scheduled maintenance, or wants to replace README
  copy-paste rituals without drifting into environment provisioning, deployment
  architecture, Git history policy, or observability design.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for CLI/dev workflow, backend, frontend, fullstack, and game-adjacent
  repositories where the main problem is repo-local command glue and recurring
  maintenance. Not for machine setup, cloud deployment design, or generic Git repair.
license: MIT
metadata:
  tags: automation, task-runner, bootstrap, ci-parity, dev-workflow, hooks, repo-maintenance
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  source: akillness/jeo-skills
---

# Workflow Automation

Use this skill as the repo's **routing-first recurring workflow automation anchor**.

The job is not to dump a giant Makefile, shell-script pile, hook config, and CI YAML blob.
The job is to:
1. classify the recurring workflow,
2. choose one primary automation mode,
3. keep local entrypoints, hooks, CI mirrors, and scheduled maintenance honest about scope,
4. emit one reusable packet with clear route-outs.

Read these support docs first:
- [references/automation-modes.md](references/automation-modes.md)
- [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)

If the main ask is:
- **machine/runtime provisioning, local services, devcontainers, or cross-machine reproducibility** → use `system-environment-setup`
- **deployment rollout, hosted CI/CD architecture, preview/staging/prod promotion, or rollback design** → use `deployment-automation` or `vercel-deploy`
- **branch/rebase/recovery/push safety** → use `git-workflow`
- **test-depth / merge-gate policy** → use `testing-strategies`
- **runtime telemetry / alerts / production visibility** → use `monitoring-observability`

## When to use this skill
- Replace README command sprawl with one repeatable repo-owned command surface
- Choose between package scripts, Make, `just`, Task, shell entrypoints, hooks, CI wrappers, or maintenance bots
- Design `setup`, `bootstrap`, `dev`, `test`, `lint`, `verify`, or `ci` commands for a repo
- Tighten the boundary between local workflow glue and hosted CI enforcement
- Decide whether a repeated chore belongs in hooks, a task runner, or scheduled automation
- Diagnose a messy workflow layer spread across docs, scripts, hooks, and CI YAML

## When not to use this skill
- The real blocker is machine setup, service topology, toolchain pinning, or container/devcontainer reproducibility
- The real blocker is release/deploy architecture or cloud runtime automation
- The real blocker is Git collaboration/recovery rather than repo command design
- The real blocker is test strategy policy rather than how commands are exposed
- The commands are already obvious and the only job is trivial implementation

## Instructions

### Step 1: Normalize the request
Capture the request in this form first:

```yaml
workflow_intake:
  primary_goal: task-entrypoints | bootstrap-onboarding | local-ci-parity | hook-guardrails | repo-maintenance | workflow-diagnosis | hybrid
  repo_shape: single-app | app-plus-services | monorepo | library-cli | docs-content | game-project | unknown
  current_surface: package-scripts | make-just-task | shell-scripts | ci-workflows | hooks | bots-schedules | mixed | none | unknown
  main_pain:
    - command-sprawl
    - onboarding-drift
    - local-vs-ci-mismatch
    - interactive-script
    - cross-platform-friction
    - duplicated-logic
    - hook-friction
    - bot-noise
    - unclear-owner
    - unknown
  blast_radius: local-dev-loop | repo-plus-ci | multi-team-repo | unknown
  confidence: high | medium | low
```

If the request is vague, assume the smallest obvious **repo-local recurring workflow** interpretation and state the assumption.

### Step 2: Choose exactly one primary mode
Pick one mode for the current run:
1. **task-entrypoints** — one memorable command surface for recurring human-invoked work
2. **bootstrap-onboarding** — first-run setup, seed/init, or repeated repo initialization
3. **local-ci-parity** — one local verification command that mirrors the critical CI checks
4. **hook-guardrails** — fast local hygiene checks before commit/push
5. **repo-maintenance** — dependency updates, scheduled cleanup, release-prep chores, stale-item automation
6. **workflow-diagnosis** — the workflow layer is messy and needs simplification before more automation is added

Use `workflow-diagnosis` when the repo currently has too many front doors and you need to simplify before picking the new steady-state mode.

### Step 3: Pick the smallest automation surface
Use these defaults:
- **package scripts / Make / `just` / Task** for the human-facing entrypoint layer
- **hooks** for fast deterministic guardrails only
- **hosted CI** for enforcement, matrices, schedules, and secrets-dependent work
- **local CI wrappers** when faster pre-push feedback is the point
- **bots / schedules** when the work is recurring maintenance rather than a command humans should type every day

Do not let repo automation silently absorb environment provisioning or deployment architecture.

### Step 4: Keep the workflow invariants visible
These rules should survive every answer:
- prefer one obvious front door over many partially documented ones
- keep bootstrap flows idempotent and non-interactive by default
- hooks must stay short, deterministic, and mirrored in CI because local bypass exists
- local CI parity should mirror the critical checks, not every hosted-runner detail
- scheduled maintenance needs an owner/review policy, not just a bot config
- name where local and hosted automation intentionally differ

### Step 5: Build the workflow automation packet
Return this structure:

```markdown
# Workflow Automation Packet

## Recommended mode
- Mode: task-entrypoints | bootstrap-onboarding | local-ci-parity | hook-guardrails | repo-maintenance | workflow-diagnosis
- Why this mode fits: ...

## Current state
- Repo shape: ...
- Current surface: ...
- Main pain: ...
- Blast radius: ...
- Confidence: high | medium | low

## Recommended surface
- Human-facing entrypoint: ...
- Supporting hooks / CI / schedules: ...
- What stays out of scope: ...

## Safest next move
1. ...
2. ...
3. ...

## Guardrails
- Idempotency / non-interactive behavior: ...
- Local vs CI boundary: ...
- Ownership / review policy: ...

## Route-outs
- `system-environment-setup` when ...
- `deployment-automation` / `vercel-deploy` when ...
- `git-workflow` when ...
- `testing-strategies` when ...
```

### Step 6: Use the mode packets, not a giant tool catalog
Pull the exact packet shape from [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md).

Rules:
- `task-entrypoints` should collapse multiple commands into one discoverable human surface
- `bootstrap-onboarding` must end with a verification command and state prerequisite boundaries
- `local-ci-parity` must call out parity limits such as secrets, services, or matrix differences
- `hook-guardrails` must stay fast enough that contributors do not immediately bypass them
- `repo-maintenance` must include review cadence / batching / noise control expectations
- `workflow-diagnosis` must simplify and dedupe before proposing another layer

## Output format
Return a short **Workflow Automation Packet** or **Automation Hardening Brief**.

Required qualities:
- classify the workflow before prescribing tools
- choose one primary mode
- prefer the smallest useful surface
- keep local commands, hooks, CI, and schedules honest about their boundaries
- make route-outs explicit instead of letting the skill absorb neighboring jobs

## Examples

### Example 1: messy command surface
Input: "This repo has README commands, a stale Makefile, and random scripts. We need one repeatable automation layer for dev, test, and lint."
Output direction: choose `workflow-diagnosis`, consolidate to one human-facing surface, then route deployment/environment concerns away.

### Example 2: local verification before push
Input: "Developers keep pushing just to discover CI failures. I want one local command that mirrors CI enough to catch problems earlier."
Output direction: choose `local-ci-parity`, add one `ci` wrapper, and state parity limits instead of promising full CI reproduction.

### Example 3: onboarding pain
Input: "New contributors need to install tools, copy env files, seed data, and run setup every time they switch branches."
Output direction: choose `bootstrap-onboarding`, recommend one idempotent bootstrap entrypoint, and hand broad machine/service setup to `system-environment-setup`.

### Example 4: scheduled repo chores
Input: "Dependency updates and cleanup tasks keep slipping. Should this live in scripts, hooks, or scheduled automation?"
Output direction: choose `repo-maintenance`, recommend bots/schedules plus review rules, and keep daily developer entrypoints separate.

## Best practices
1. Start from the repeated workflow, not from a favorite tool.
2. Prefer one discoverable front door over many half-owned surfaces.
3. Keep repo-local glue separate from environment, deployment, Git policy, and observability.
4. Treat interactive prompts as a last resort.
5. If local and CI differ, say exactly where and why.
6. Simplify and dedupe before adding more automation.

## References
- [Task: The Modern Task Runner](https://taskfile.dev/)
- [Just Programmer's Manual](https://just.systems/man/en/)
- [mise tasks](https://mise.jdx.dev/tasks/)
- [pre-commit](https://pre-commit.com/)
- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [act documentation](https://nektosact.com/)
- [Development containers](https://containers.dev/)
