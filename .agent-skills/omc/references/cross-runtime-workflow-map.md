# Cross-Runtime Workflow Map

Use this reference when an operator asks to take Claude Code OMC workflows and make them usable from Codex/OMX or Gemini/Antigravity/OMA.

## Mapping

| Claude / OMC intent | Codex / OMX | Gemini / Antigravity / OMA | Notes |
|---------------------|-------------|-----------------------------|-------|
| `/team N:role "task"` | `$team N:role "task"` inside Codex or `omx team N:role "task"` in the shell | `/orchestrate` or `oma agent:parallel -i role:"task"` | Coordinated work with shared task context. Antigravity can consume the harness but may need OMA CLI fallback for explicit spawning. |
| `/autopilot "task"` or `autopilot: task` | `$autopilot "task"`; prepend `$deep-interview` if the request is underspecified, or use `$plan` → `$ralph` for stricter completion loops | `/plan "task"` → `/work`; add `/orchestrate` or `oma agent:parallel` only for explicit parallel lanes | End-to-end idea → plan → implementation → verification. Antigravity can consume the generated harness, but native Claude-style `/autopilot` is not guaranteed. |
| `/ultrawork "task"` or `ulw "task"` | `$ulw "task"` or `$ultrawork "task"` | `/ultrawork "task"` when exposed, otherwise `oma agent:parallel` with independent lanes | Burst parallelism for independent work streams. |
| `/ultraqa "target"` | `$ultraqa "target"` | `/review "target"` or `/ultrawork "QA target"` with QA/security/performance/accessibility lanes | QA fan-out. Do not promise a native Antigravity `/ultraqa` command unless the local OMA projection exposes it. |

## State Boundaries

| Runtime | State root | Planning/spec root |
|---------|------------|--------------------|
| OMC | `.omc/state/` | `.omc/specs/`, `.omc/plans/` |
| OMX | `.omx/state/` | `.omx/plans/` |
| OMA | `.agents/` source, generated views under `.gemini/`, `.claude/`, `.codex/` | `.agents/workflows/`, `.agents/skills/` |

Never write Codex runtime scratch into `.omc/`, and never treat generated OMA vendor views as the canonical source. For portable harness work, edit `.agents/` and run `oma link`.

## Routing Rule

- If the operator is inside Claude Code and wants Claude-native execution, stay on `omc`.
- If the operator wants Codex-native workflow skills, route to `omx`.
- If the operator wants Gemini or Antigravity compatibility, route to `ohmg` / OMA and state the Antigravity spawning boundary plainly.
