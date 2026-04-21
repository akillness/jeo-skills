# Context: ohmg modernization

## Workflow Context
The current `ohmg` skill is stale against upstream reality. Local `ohmg` still describes `oh-my-ag`, `bunx oh-my-ag`, `/coordinate`, and a Serena-memory-centered workflow, while upstream now positions **`oh-my-agent`** as a portable multi-agent harness with **`.agents/` as the source of truth**, generated native agent surfaces for `.gemini/agents`, `.claude/agents`, and `.codex/agents`, and a fallback to `oma agent:spawn` for cross-vendor work.

Modern `oh-my-agent` usage is not just “spawn a backend agent and watch the dashboard.” Upstream emphasizes:
1. install or launch via `oh-my-agent` / `oma`
2. keep project-local agents/skills/workflows under `.agents/`
3. use vendor-native subagents when the runtime matches the target vendor
4. fall back to CLI spawning for cross-vendor work
5. treat Gemini CLI and Antigravity as related but not identical surfaces

Antigravity is especially important because it can read `.agents/agents/` directly but does **not** support custom subagent spawning. That means a useful `ohmg` skill should explain capability boundaries instead of pretending Gemini CLI and Antigravity have the same orchestration surface.

Primary sources:
- https://github.com/first-fluke/oh-my-agent
- https://github.com/first-fluke/oh-my-agent/blob/main/README.md
- https://github.com/first-fluke/oh-my-agent/blob/main/docs/SUPPORTED_AGENTS.md
- https://github.com/first-fluke/oh-my-agent/blob/main/GEMINI.md
- local `.agent-skills/ohmg/SKILL.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Gemini CLI operator | Install and use a multi-agent harness inside Gemini-native terminal workflows | Intermediate |
| Antigravity operator | Reuse `.agents`-based projects from Antigravity while understanding native limitations | Intermediate |
| Mixed-vendor agent lead | Route work across Gemini, Claude, and Codex without losing a portable source of truth | Advanced |
| Repo maintainer / installer | Keep generated vendor surfaces, symlinks, and MCP/bridge setup working | Intermediate to advanced |

## Current Workarounds
1. In `oh-my-skills`, users currently rely on a **stack** (`jeo`, `ohmg`, `ralph`, `ralphmode`, `vibe-kanban`) rather than getting a modern portable-harness explanation from `ohmg` itself.
2. The setup prompt works around platform mismatch by explicitly re-targeting `ohmg` to `gemini-cli,antigravity` and cleaning up duplicate platform exposure elsewhere.
3. Upstream works around platform differences by preferring same-vendor native agent files and falling back to `oma agent:spawn` for cross-vendor tasks.
4. Antigravity workflows use bridge/MCP configuration and `.agents` ingestion instead of true native custom subagent spawning.

## Adjacent Problems
- Product/category confusion versus `omc` and `omx`: users need a clear answer for when to use a portable harness versus a vendor-first runtime layer.
- Rapid upstream change: the repo name, CLI, source-of-truth layout, and workflow surfaces have already moved materially beyond the current local skill.
- Plugin/runtime edge cases: upstream issue and PR discussion show install/manifest validation churn for generated agent files and plugin-root expectations.
- Monitoring/setup burden: dashboard and memory tooling still depend on correct file generation and optional MCP/Serena wiring.

## User Voices
> “how do you distinguish oh-my-agent from nearby harness/meta-wrapper projects?” — user question captured in upstream issue discussion, highlighting real ecosystem positioning confusion. Source: https://github.com/first-fluke/oh-my-agent/issues/155

> The differentiator is quality-first, portable `.agents` source-of-truth across multiple runtimes rather than just chasing code generation speed. Source: https://github.com/first-fluke/oh-my-agent/issues/155#issuecomment-4142133589

> Antigravity is first-class for reading `.agents/agents/`, but does not support custom subagent spawning. Source: https://github.com/first-fluke/oh-my-agent/blob/main/docs/SUPPORTED_AGENTS.md
