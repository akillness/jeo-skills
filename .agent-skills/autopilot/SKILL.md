---
name: autopilot
description: ">"
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: autopilot, omx, codex, autonomous-build, planning, implementation, qa, verification
  platforms: Codex CLI, Claude Code, Gemini CLI, OpenCode
  keyword: autopilot
  version: 1.0.0
  source: akillness/jeo-skills
  compatibility: "OMX workflow alias for `$autopilot`"
---





# Autopilot

Use this skill as the exact-name front door for `$autopilot` in Codex-style skill
loaders. It exists because documenting `$autopilot` only inside `omx` is too weak
for clients that activate skills by folder name.

## When to use this skill

- The user explicitly invokes `$autopilot`, `autopilot`, `auto pilot`, or full-auto.
- The task needs planning, implementation, QA, and final verification.
- The user wants the agent to build the whole thing end to end.

## Instructions

1. Confirm the request needs end-to-end autonomous execution, not a small focused edit.
2. Inspect the repo enough to identify stack, test commands, and risky boundaries.
3. Freeze a compact execution packet:
   - goal
   - constraints
   - files or areas likely to change
   - verification commands
4. Implement in the smallest safe slices.
5. Run QA after each meaningful slice, then a final clean verification pass.
6. Report what changed and the exact checks that passed or failed.

## Runtime Notes

- If the local OMX runtime is available and the user clearly wants that runtime,
  use the existing OMX workflow state under `.omx/`.
- If OMX is not available, still apply this skill as an in-session Codex workflow:
  plan, edit, verify, and keep going until the acceptance checks are honestly
  resolved or blocked.
- Do not pretend that shell `omx team` or Claude `/autopilot` is the same
  implementation. Treat them as runtime-specific equivalents of the same intent.

## Stop Conditions

- The same verification failure repeats three times with no new evidence.
- Required credentials, services, or product decisions are unavailable.
- The user cancels or narrows the request to a smaller task.

## Examples

- `$autopilot build a task API with auth and tests`
- `autopilot migrate this CLI to use SQLite persistence`

## Best practices

- Keep the execution packet small enough to verify.
- Prefer repo-native test/build commands over invented commands.
- Preserve failure evidence before changing code.

## References

- `omx` for broader Codex runtime setup and command parity.
- `ooo` for immutable spec-first execution.
