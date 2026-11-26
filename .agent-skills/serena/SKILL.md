---
name: serena
description: >
  Operate oraios/serena, a semantic coding agent toolkit and MCP server backed by SolidLSP language servers for symbol-level retrieval and editing across 30+ programming languages. Use when installing serena-agent with uv, initializing or indexing a project, running serena start-mcp-server with context/mode profiles, or troubleshooting language server setups and JetBrains integration. Do not use for lightweight AST/ripgrep search without LSP daemons (route to semble) or document+code community graphs (route to graphify). Triggers on: serena, serena-agent, solidlsp, serena start-mcp-server, symbol-level mcp.
allowed-tools: Read Glob Grep Bash
compatibility: Python >=3.11 and <3.15 (uv tool install -p 3.13 serena-agent recommended) or Docker. Preflight runs offline in Python 3.10+.
license: MIT AND GPL-3.0-or-later
metadata:
  version: "1.0.0"
  source: https://github.com/oraios/serena
  upstream_commit: 23c06ff715409b2e9dc9be7ca26b7b2fbf356b7c
  pinned_at: "2026-11-24"
---

# Serena (`oraios/serena`)

Source-pinned operator guide for `oraios/serena` (`serena-agent`, dual-licensed: `SolidLSP` under MIT, `Serena` agent/MCP under `GPL-3.0-or-later`).

## When to use this skill

- Installing `serena-agent` properly via `uv` (`uv tool install -p 3.13 serena-agent`) or Docker (`ghcr.io/oraios/serena`), avoiding outdated MCP/plugin marketplace installers.
- Indexing repositories (`serena project index`), verifying language servers (`serena project health-check`), or configuring contexts/modes (`serena context list`, `serena mode list`).
- Launching `serena start-mcp-server` for Claude Code, Codex, IDEs, or JetBrains (`serena init -b JetBrains`).
- Routing out: use `semble` or `codebase-search` for zero-daemon fast search, `codebase-memory-mcp` for persistent SQLite AST graphs, and `graphify` for code-and-doc knowledge clustering.

## Instructions

1. **Run offline preflight first** to inspect `uv`, `serena`, `serena-agent`, and Python tools:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Install via the upstream-recommended `uv` path (not marketplace shortcuts)**:
   - Upstream explicitly warns **against** installing Serena via MCP or plugin marketplaces because those wrappers carry outdated launch commands.
   - Preferred installation:
     ```bash
     uv tool install -p 3.13 serena-agent
     ```
   - Verify Python version compatibility (`>=3.11, <3.15` in `pyproject.toml`).

3. **Initialize, index, and health-check the target repository**:
   - Interactive setup: `serena init` (or `serena init -b JetBrains` when bridging JetBrains IDEs) and `serena setup`.
   - Create/validate project config: `serena project create` / `serena project generate-yml` / `serena project health-check`.
   - Pre-warm LSP symbol caches on large codebases: `serena project index`.

4. **Launch MCP with explicit `--context` and `--project` scope**:
   - Inspect available contexts/modes/tools: `serena context list`, `serena mode list`, `serena tools list`.
   - Start stdio/HTTP MCP server:
     ```bash
     serena start-mcp-server --context claude-code --project /path/to/repo
     ```
   - Observe the dual-license boundary: SolidLSP (`src/solidlsp`) is `MIT`, while Serena (`src/serena`) is `GPL-3.0-or-later`; modifying/redistributing Serena code triggers GPL-3.0 obligations.

## Examples

- **Fresh repo onboarding with LSP indexing**:
  Run `uv tool install -p 3.13 serena-agent` -> `cd /path/to/repo && serena project create` -> `serena project index` -> `serena project health-check`.
- **Inspect active tools before attaching to an agent host**:
  Run `serena context list` and `serena tools list --only-enabled` before adding `serena start-mcp-server --context codex --project .` to MCP config.
- **JetBrains backend mode**:
  Run `serena init -b JetBrains` so symbol lookups delegate to the running JetBrains plugin instead of spawning separate standalone LSP servers.

## Best practices

- Pre-index large repositories with `serena project index` before long MCP sessions so initial `find_symbol` calls do not time out.
- Scope `--project` explicitly to the active repository root and avoid exposing unauthenticated HTTP MCP listeners on non-loopback interfaces.
- Keep `GPL-3.0-or-later` obligations distinct when bundling or modifying `src/serena` versus calling it as an external local CLI/MCP tool.

## References

- Pinned upstream summary, CLI groups, and dual-license notes: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
