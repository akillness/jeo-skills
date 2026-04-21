# Runtime Boundaries for OHMG

## What `ohmg` owns
`ohmg` is the **Gemini CLI / Antigravity-facing entrypoint** for the portable `oh-my-agent` harness.

Use it when the user wants:
- Gemini-native generated agents
- Antigravity compatibility
- `.agents/` as the portable source of truth
- cross-vendor-ready structure before choosing a vendor-first runtime layer

## Gemini CLI
Gemini can use generated native agent files when the runtime vendor matches.

Good framing:
- keep `.agents/` canonical
- generate `.gemini/agents/*.md`
- let Gemini use those native files
- fall back to CLI spawning only when native dispatch is not the right execution path

## Antigravity
Antigravity can read `.agents/agents/` directly, but **does not support custom subagent spawning** the same way Gemini / Claude / Codex runtimes can.

Good framing:
- compatible with the portable harness
- not equivalent to Gemini-native custom multi-agent execution
- often a consumer surface rather than the canonical spawning runtime

## When to route to `omc`
Route to `omc` when the user wants:
- Claude Code-native orchestration
- `/team`, `/autopilot`, `/ralph`, `/ccg`, or other Claude-first runtime flows
- plugin/setup guidance specific to Claude Code

## When to route to `omx`
Route to `omx` when the user wants:
- Codex-first orchestration
- `$deep-interview`, `$ralplan`, `$team`, `$ralph`, or `.omx/` runtime-state behavior
- Codex CLI-native workflow guidance

## Common mistake to avoid
Do not flatten `ohmg`, `omc`, and `omx` into three equivalent platform wrappers.

A cleaner model is:
- `ohmg` = portable harness adoption from Gemini / Antigravity
- `omc` = Claude-first runtime overlay
- `omx` = Codex-first runtime overlay
