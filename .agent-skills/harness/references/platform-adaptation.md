# Harness Platform Adaptation

Use this note when the user wants Harness ideas outside Claude Code.

## Core translation rule

Harness is fundamentally:

- agent roster design
- orchestration pattern selection
- skill scaffolding
- validation loop definition

Those ideas are portable even when file paths are not.

## Mapping

### Claude Code

- closest to upstream `revfactory/harness`
- use `.claude/agents/` and `.claude/skills/`

### Codex CLI

- map agent roster to `.codex/agents/` or equivalent role prompts
- map skill scaffolding to `.codex/skills/`
- keep orchestration rules in repo-level docs when direct equivalents are missing

### Gemini / Antigravity

- preserve the orchestration pattern
- adapt output to the Antigravity workflow or skill surface

### OpenCode / Pi / Claw

- prioritize reusable prompts, skill docs, and deterministic scripts
- document missing native features rather than inventing fake compatibility

## Non-goal

Do not claim that every platform supports the same team APIs or plugin commands.
