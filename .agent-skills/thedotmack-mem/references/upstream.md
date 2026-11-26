# Upstream Provenance: `thedotmack/claude-mem`

- **Repository**: <https://github.com/thedotmack/claude-mem>
- **Pinned Commit**: `9b3b78dfa53f80e7c9c447b9269ceda255ee99d9` (`2026-11-26`)
- **License**: `Apache-2.0` (`package.json` version `17.0.0`)
- **Local Skill Name Rationale**: Named `thedotmack-mem` locally to satisfy reserved-word skill lint rules (`claude`) while targeting `claude-mem` without aliasing or mutating upstream tool names.

## Architecture & Lifecycle Hooks

`claude-mem` runs an HTTP/WebSocket worker daemon (default `http://localhost:37777`, Web UI viewer + REST/MCP bridge) backed by SQLite FTS5 and optional Chroma vector search under `~/.claude-mem/`.

Five lifecycle hooks capture and inject context automatically:
1. `SessionStart` — injects recent session summaries and observation index into the fresh context.
2. `UserPromptSubmit` — captures user prompt metadata and intent boundaries.
3. `PostToolUse` — records tool outputs as structured observations (honoring `<private>...</private>` exclusions).
4. `Stop` — summarizes completed turn progress.
5. `SessionEnd` — flushes pending observations and closes session summaries.

## Installation & CLI Notes

- **Supported install paths**:
  - `npx claude-mem install` (supports `--ide opencode`, provider configuration, and automated hook/worker setup)
  - Claude Code plugin commands: `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem`
- **Common trap**: `npm install -g claude-mem` installs the library/SDK only; it does **not** install lifecycle hooks or configure the background worker service.
- **Telemetry opt-out**: `npx claude-mem telemetry disable` or `CLAUDE_MEM_ONLINE_OPTIN=false`.

## Progressive MCP Search Tools

1. `search` — returns lightweight index records (IDs, titles, dates, estimated token cost).
2. `timeline` — returns chronological context windows around an observation ID or query anchor.
3. `get_observations` — returns full observation payloads for explicit IDs only.
4. `save_memory` — saves explicit user/agent memories with optional title and project tags.
5. `smart_search` / `smart_outline` / `smart_unfold` — tree-sitter AST-level progressive code exploration tools when enabled.
6. `__IMPORTANT` — workflow instructions reminding agents to run `search` -> `timeline` -> `get_observations` before loading raw payloads.

## Boundaries & Cross-Routing

- **Privacy**: Wrap secrets in `<private>...</private>` before tool invocations; audit `~/.claude-mem/` before backups.
- **Route out**:
  - Repo-local `.mex/` living wikis and causal checks -> `mex`
  - Code + document knowledge graph clustering -> `graphify`
  - Local sandbox execution to reduce tool output tokens -> `context-mode`
  - Personal markdown second-brain vaults -> `obsidian-second-brain`
