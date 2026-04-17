# Runtime Boundaries for `ralph`

`ralph` is the portable **specification-first + persistent-completion contract**.
This file explains what stays inside that contract and what belongs to sibling runtime skills.

## Keep inside `ralph`

- Socratic interview before coding
- Ambiguity reduction before seed generation
- Immutable seed / spec discipline
- Execute against the seed, not drifting chat history
- Verification-before-done
- Drift checks against the original contract
- Persistent completion as a method: execute → verify → adjust → continue
- Unstuck routing through the Nine Minds

## Keep outside `ralph`

### `omc`
Use when the main problem is Claude-native orchestration:
- Claude hook wiring
- Teams / Autopilot / Ultrabork-style runtime behavior
- Claude-native session and subagent handling
- Claude-specific environment or plugin setup

### `omx`
Use when the main problem is Codex-native execution:
- `$plan`, `$ralph`, `$team`, and OMX runtime flow
- Codex-native hooks, `.rules`, sandbox, approval, or profile behavior
- tmux/runtime shell management
- Codex-specific install or migration details

### `ohmg`
Use when the main problem is Gemini / Antigravity harness setup:
- `.agents` source of truth
- generated Gemini-facing projections
- Gemini-native agent packaging and harness layout
- Antigravity compatibility

### `jeo`
Use when the task needs the integrated delivery stack:
- `.jeo/` ledger
- plan approval / plannotator handoff
- browser verification and annotation feedback
- cleanup / resumable delivery workflow

### `ralphmode`
Use when the main question is safety posture:
- approvals
- trust folders / repo trust posture
- sandbox-first vs YOLO profiles
- secret deny-lists and guardrails

## Settings / Rules / Hooks model

### Settings
Runtime-specific configuration belongs to the runtime skills:
- Claude settings and hook config → `omc`
- Codex config / profiles / hooks / `.rules` → `omx`
- Gemini settings / trusted folders / hooks → `ohmg`

`ralph` only owns method-level thresholds like ambiguity, drift, and convergence.

### Rules
Boundary / approval / runtime policy belongs outside `ralph`.
`ralph` should only insist on:
- clarify before code when ambiguity is high
- freeze the seed before execution
- verify before done
- stop only on verified success, convergence, or configured cap

### Hooks
`ralph` should describe the need for continuation, not every platform's hook JSON.
Examples of runtime-owned hook behavior:
- Claude `PreToolUse`, `PostToolUse`, `Stop`, session hooks
- Codex native experimental hooks and fallback/manual prompts
- Gemini `AfterAgent` continuation hooks

## Current local setup reality

The repo ships:
- `scripts/setup-codex-hook.sh` as the **local fallback helper** for Codex
- `scripts/setup-gemini-hook.sh` as the **local Gemini helper**
- `scripts/ooo-state.sh` for local helper-state inspection

That does **not** mean `ralph` owns every Codex/Gemini runtime behavior. It means the repo currently provides those local helpers while runtime-native flows still belong to their platform skills.

## Why this matters

When `ralph` absorbs too much runtime detail, three things break:
1. trigger precision drops
2. docs go stale faster than the core method
3. neighboring runtime skills start to look duplicated even when they are not

The maintenance rule is simple:
- keep the front door small and truthful
- move slower-changing runtime detail into references
- route platform-native execution to the proper sibling skill
