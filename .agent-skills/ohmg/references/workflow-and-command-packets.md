# Workflow and Command Packets

## Current workflow surfaces
Use upstream `oh-my-agent` workflow language instead of legacy `oh-my-ag` snippets.

### Workflow packets
- `/plan` — planning and task breakdown
- `/work` — step-by-step gated multi-agent execution
- `/orchestrate` — CLI-based parallel execution
- `/ultrawork` — higher-intensity quality workflow
- `/review` — security / performance / accessibility review
- `/debug` — structured debugging
- `/scm` — SCM and Git workflow support

## CLI packets
```bash
oma doctor
oma link
oma dashboard
oma dashboard:web
oma agent:spawn backend "Build auth API" session-01
oma agent:parallel -i backend:"Auth API" frontend:"Login form"
```

## How to explain them
- present workflow packets as the **portable harness layer**
- present CLI commands as **operator tools** for verification, regeneration, spawning, and monitoring
- do not promise every runtime exposes the same native UI or spawning mechanics
- for Claude parity requests, map `/team` to `/orchestrate` or `oma agent:parallel`, `/ultrawork` to OMA `/ultrawork`, and `/ultraqa` to `/review` or a QA-focused `/ultrawork`

## Response pattern
1. identify whether the user is Gemini-first, Antigravity-first, or portable-harness-first
2. give the exact install / link / verification commands
3. explain the native-vs-fallback dispatch rule
4. route Claude-first runtime depth to `omc`
5. route Codex-first runtime depth to `omx`
