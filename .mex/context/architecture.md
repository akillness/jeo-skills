---
name: architecture
description: How the major pieces of this project connect and flow. Load when working on system design, integrations, or understanding how components interact.
triggers:
  - "architecture"
  - "system design"
  - "how does X connect to Y"
  - "integration"
  - "flow"
edges:
  - target: context/stack.md
    condition: when specific technology details are needed
  - target: context/decisions.md
    condition: when understanding why the architecture is structured this way
grounds_to: []
last_updated: 2026-11-18
---

# Architecture

## System Overview
Requests enter a coding agent host (Claude Code, Codex CLI, Gemini CLI, Antigravity, Cursor, OpenCode, Pi, GJC, JeoPi) with the shared rule file `~/.agents/rules/jeo-workflows.md` (and `<project>/.agents/rules/jeo-workflows.md`) injected automatically. The per-prompt workflow follows `openspace → rtk → semble → jev → memory (.mex / jeox / zg / knowledge)`. Both `route_prompt.py` and `jev-plugin.mjs` walk ancestors upward from `cwd` (stopping before `$HOME` and rejecting symlinks) to check `.harness2/workspace.json`; when `workflow.custom` is `true`, per-project order, `jev_profile`, and `skills_root` override global defaults (`~/.agents/harness/workspace.json`), and outcomes append to `~/.local/state/jeo-skill/workflow-events.jsonl`.

## Key Components
- **Skill Catalog & Router (`.agent-skills/skills.json`, `.agent-skills/jeo-skill/`)**: SSOT manifest describing all cataloged skills, categories, and relationships; installed into `~/.agents/skills` and linked to host skill directories via `refresh-host-links.py`. `workflow_log_cli.py` (`jeo-skill flow-log`) + `scripts/workflow-log.py` (`~/.local/bin/jeo-flow-log`) provide one scrubbed, size-rotated JSONL ledger (`~/.local/state/jeo-skill/workflow-events.jsonl`) across global and custom project flows.
- **Workspace & Harness² Orchestrator (`scripts/setup-workspace.py`, `.harness2/workspace.json`)**: Configures global (`~/.agents/harness/workspace.json`) and project (`<repo>/.harness2/workspace.json`) method-mode component maps, workflow rules, `.mex/`, `zg`, `jeox`, and git post-commit hooks while preserving `customWorkflow: true` projects across global refreshes.
- **Jev Control Plane (`jev/jev-harness.mjs`, `jev/jev-plugin.mjs`)**: Evaluates local `qev` (`http://127.0.0.1:8017/v1/systemone`) or remote API policies (`route-skills`, `prune-context`, `moderate`, `gate-tool`, `decide-action`, `evaluate-run`, `calibrate-judge`) using a cached v3 catalog BM25 index (`tmpdir()/jev-index-v3-*.json`).
- **Code Graph & BM25 Fallback (`../jeo-code` `packages/jeo-mem` / `jeo jeox`, delegating shim `scripts/jeox.py`)**: `.jeo/db/jeo.db` is owned and managed exclusively by `../jeo-code` (`schema_versions`, `code_files`, `code_nodes`, `code_edges`, `code_refs`, `code_imports`, `code_chunks`, FTS5); `jeo-skills` contains no SQLite writer and delegates CLI/MCP/workspace calls to `jeo-code` (with `$HOME` guard, legacy-table pruning, and multi-repo LRU cache).
- **Multi-Host MCP Provisioner (`scripts/setup-mcp-hosts.py`, `setup.md`)**: Provisions `@upstash/context7-mcp`, repairs host binary references, configures Claude/Codex/Gemini/Antigravity/Cursor/OpenCode/Pi/GJC/JeoPi (plus Orca profile dirs), and verifies live JSON-RPC stdio handshakes.

## External Dependencies
- **Context7 Upstash Documentation Service** — queried locally via provisioned `context7` MCP stdio entrypoint (`~/.local/share/jeo-skill/context7-mcp`, `resolve-library-id`, `query-docs`); supports optional `CONTEXT7_API_KEY`.
- **Loopback qev Inference Server & Host CLIs** — serves local Jev policy evaluation on port 8017 while host CLIs read user MCP/hook configs.
- **Mex / zvec-grep / OpenSpace / RTK / Semble** — external developer CLIs invoked by `setup-workspace.py` and host workflow hooks.

## What Does NOT Exist Here
- No daemonized runtime in this repo other than the optional Jev launchd service and stdio MCP servers spawned on demand by hosts.
- Aside daemon settings (`~/.aside/u/*/settings.json`) are never mutated by `scripts/setup-mcp-hosts.py` (read-only audit only).
