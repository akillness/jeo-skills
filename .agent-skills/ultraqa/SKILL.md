---
name: ultraqa
description: >
  Run an autonomous QA cycling workflow: test, diagnose, fix, and repeat until
  the quality goal is met or a concrete blocker is proven. Use when the user
  explicitly invokes `$ultraqa`, `ultraqa`, asks for QA cycling, test/build/lint
  repair, or a parallel review burst. Also tolerate the common typo `$ultaqa`
  by treating it as `$ultraqa`.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: ultraqa, ultaqa, $ultraqa, $ultaqa, omx, codex, qa, tests, build, lint, typecheck, review
  platforms: Codex CLI, Claude Code, Gemini CLI, OpenCode
  keyword: ultraqa
  version: "1.0.0"
  source: akillness/jeo-skills
  compatibility: OMX workflow alias for `$ultraqa`
---

# UltraQA

Use this exact-name skill for `$ultraqa`. If the user types `$ultaqa`, treat it
as a typo for `$ultraqa` and continue with the same QA contract.

## When to use this skill

- The user explicitly invokes `$ultraqa`, `$ultaqa`, or `ultraqa`.
- The task is to make tests, build, lint, typecheck, or review gates pass.
- The user wants a diagnose-fix-repeat quality loop.

## Instructions

Parse one QA goal, run the relevant verification, preserve failure evidence,
apply the smallest fix, and repeat until pass or blocker.

## Goal Parsing

Map the request to one primary QA goal:

- `tests`: test suite passes
- `build`: build exits successfully
- `lint`: lint exits successfully
- `typecheck`: type checker exits successfully
- `review`: parallel review of correctness, security, performance, or UI concerns
- `custom`: user-specified success condition

## Cycle

Repeat up to five cycles:

1. Run the relevant verification command.
2. If it passes, stop and report the passing command.
3. If it fails, preserve the failure evidence.
4. Diagnose the likely root cause.
5. Apply the smallest fix.
6. Re-run verification.

Stop early if the same failure repeats three times without new evidence.

## Command Discovery

Prefer repo-native commands from `package.json`, `Makefile`, project docs, CI
config, or existing scripts. Do not invent a test command when the repo gives a
clear one.

## Route-Outs

- Use `ultrawork` when the main job is independent implementation lanes.
- Use `team` for coordinated runtime workers.
- Use `code-review` for review-only findings without an edit loop.

## Examples

- `$ultraqa --tests`
- `$ultaqa make lint and typecheck pass`

## Best practices

- Use repo-native verification commands.
- Stop after three identical failures without new evidence.
- Report the final passing command exactly.

## References

- `testing-strategies` for policy-level gate design.
- `code-review` for review-only passes.
