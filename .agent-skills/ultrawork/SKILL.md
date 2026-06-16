---
name: ultrawork
description: >
  Run a high-parallelism work burst for independent implementation or cleanup
  lanes. Use when the user explicitly invokes `$ultrawork`, `$ulw`, `ultrawork`,
  or asks to parallelize separable work quickly. Choose `team` when workers need
  shared task state, and choose `ultraqa` when the work is primarily QA/review.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: ultrawork, ulw, $ulw, $ultrawork, omx, codex, parallel-work, burst-work
  platforms: Codex CLI, Claude Code, Gemini CLI, OpenCode
  keyword: ultrawork
  version: "1.0.0"
  source: akillness/jeo-skills
  compatibility: OMX workflow alias for `$ulw` and `$ultrawork`
---

# Ultrawork

Use this exact-name skill for `$ultrawork` and `$ulw` so the parallel-work intent
activates directly.

## When to use this skill

- The user explicitly invokes `$ultrawork`, `$ulw`, or `ultrawork`.
- The task has separable implementation, cleanup, docs, tests, or migration lanes.
- Shared-file contention is low enough to integrate at the end.

## Instructions

Run the fit check, split lanes, keep file ownership explicit, and verify after
integration.

## Fit Check

Use `ultrawork` only when the work can be split into mostly independent lanes:

- separate packages, modules, routes, docs, tests, or migrations
- low shared-file contention
- clear merge order or a small integration step

Do not use it when the task needs a single careful design decision, shared
runtime state, or constant cross-worker coordination.

## Workflow

1. Identify independent lanes and the files each lane owns.
2. Name shared files that must be edited last by the coordinator.
3. Run safe lanes in parallel where tools/runtime allow it.
4. Integrate shared-file changes deliberately.
5. Run the full verification command set once after integration.

## Runtime Notes

- In OMX-enabled environments, `$ulw` and `$ultrawork` are the Codex-side
  equivalents of Claude `/ultrawork`.
- In plain Codex sessions, apply the same contract with available local tools:
  parallelize reads/checks where possible, keep file ownership explicit, and
  serialize shared edits.

## Route-Outs

- Use `team` for tmux-backed coordinated workers.
- Use `ultraqa` for test/build/lint review loops.
- Use `autopilot` for full idea-to-verified-code execution.

## Examples

- `$ulw split this cleanup across docs, tests, and API handlers`
- `$ultrawork parallelize the migration by package`

## Best practices

- Name owned files or directories before editing.
- Serialize shared-file edits.
- Run one full verification pass after integration.

## References

- `team` for shared-state workers.
- `ultraqa` for QA cycling.
