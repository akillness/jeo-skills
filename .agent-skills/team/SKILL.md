---
name: team
description: >
  Run or route a coordinated multi-agent team workflow for Codex/OMX. Use when
  the user explicitly invokes `$team`, asks for team mode, coordinated workers,
  tmux workers, or multiple agents sharing a task list. Prefer `omx team` when
  the runtime is installed; use `ultrawork` instead for independent parallel
  lanes that do not need shared state.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: team, $team, omx, codex, multi-agent, tmux, coordination, workers, shared-task-list
  platforms: Codex CLI, Claude Code, Gemini CLI, OpenCode
  keyword: team
  version: "1.0.0"
  source: akillness/jeo-skills
  compatibility: OMX workflow alias for `$team`
---

# Team

Use this exact-name skill for `$team` so Codex-style loaders can activate the
coordinated-worker contract directly instead of relying on the broader `omx`
router description.

## When to use this skill

- The user explicitly invokes `$team`.
- The user asks for team mode, tmux workers, or coordinated multi-agent work.
- Workers need shared runtime state or a shared task list.

## Instructions

Follow the preflight, invocation, lifecycle, and route-out rules below.

## Preflight

Before starting a real team runtime, check:

```bash
command -v omx
command -v tmux
```

If either is missing, stop and report the missing runtime requirement. Do not
simulate `omx team` with unrelated in-process fan-out when the user asked for the
runtime-backed team workflow.

## Invocation

Use the shell runtime when available:

```bash
omx team 3:executor "task"
omx team ralph "task"
omx team status <team-name>
omx team shutdown <team-name>
```

## Lifecycle Rules

1. Start the team and capture concrete evidence: team name, tmux panes, and state path.
2. Monitor with `omx team status <team-name>`.
3. Wait until tasks are terminal before shutdown unless the user explicitly aborts.
4. Keep `.omx/state/team/<team>/` owned by the runtime; do not delete it manually.

## Route-Outs

- Use `ultrawork` for independent lanes with little coordination.
- Use `ultraqa` for QA/review fan-out.
- Use `omx` for installation, doctor checks, and cross-runtime mapping guidance.

## Examples

- `$team 3:executor "fix all TypeScript errors"`
- `omx team ralph "ship the auth cleanup with verification"`

## Best practices

- Capture startup evidence before assuming the team is running.
- Do not shut down while workers are still writing task updates.
- Keep runtime state under `.omx/state/team/<team>/`.

## References

- `omx` for runtime setup and doctor checks.
- `ultrawork` for independent burst lanes.
