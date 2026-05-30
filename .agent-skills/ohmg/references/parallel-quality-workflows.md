# Autonomous, Parallel, and Quality Workflows

This reference maps Claude Code OMC workflows (`team`, `autopilot`, `ultrawork`, `ultraqa`) to the portable OMA / `oh-my-agent` harness for Gemini and Antigravity.

## Decision Table

| Need | OMA workflow | CLI fallback | Antigravity note |
|------|--------------|--------------|------------------|
| Coordinated team execution | `/orchestrate "task"` | `oma agent:parallel -i backend:"API" frontend:"UI"` | Antigravity can consume `.agents/agents/`; explicit custom spawning may need OMA CLI fallback. |
| End-to-end autonomous build | `/plan "task"` then `/work` | Use `oma agent:parallel` only after the plan identifies independent lanes | Treat this as autopilot intent parity, not a guaranteed native `/autopilot` command. |
| Burst parallel implementation | `/ultrawork "task"` | `oma agent:parallel -i lane-a:"..." lane-b:"..."` | Use independent lanes; do not assume Claude-style shared state. |
| Parallel QA/review | `/review "target"` or `/ultrawork "QA target"` | `oma agent:parallel -i qa:"Tests" security:"Audit" performance:"Perf"` | Do not promise a native `/ultraqa` name unless the generated local workflow exposes it. |

## Source of Truth

Keep `.agents/` canonical:

```bash
oma link
oma doctor
```

Generated vendor views such as `.gemini/agents/*.md`, `.claude/agents/*.md`, and `.codex/agents/*.toml` should be regenerated, not edited by hand.

## Boundary

Use OMA for portable Gemini/Antigravity harness adoption. Route Codex-native workflow details to `omx` and Claude-native runtime details to `omc`.
