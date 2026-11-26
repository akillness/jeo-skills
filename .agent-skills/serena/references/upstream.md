# Upstream Provenance: `oraios/serena`

- **Repository**: <https://github.com/oraios/serena>
- **Pinned Commit**: `23c06ff715409b2e9dc9be7ca26b7b2fbf356b7c` (`2026-11-24`)
- **License**: `MIT` (`src/solidlsp` / SolidLSP) AND `GPL-3.0-or-later` (`src/serena`)
- **Python Requirement**: `>=3.11, <3.15` (`pyproject.toml`)

## Upstream Installation Warning

Upstream `README.md` explicitly warns:
> Do not install Serena via an MCP or plugin marketplace! They contain outdated and suboptimal installation commands.

Recommended installation:
- `uv tool install -p 3.13 serena-agent` (installs `serena`, `serena-agent`, `serena-hooks`)
- Or `uvx --from serena-agent serena ...` / container `ghcr.io/oraios/serena`

## CLI Command Surface (`src/serena/cli.py`)

- `serena init [-b JetBrains]` / `serena setup`
- `serena start-mcp-server [--context <name>] [--mode <name>] [--project <path>]`
- `serena project create|index|health-check|generate-yml|is_ignored_path`
- `serena config edit`
- `serena context list|edit|create|delete`
- `serena mode list|edit|create|delete`
- `serena tools list|description`
- `serena jetbrains ...`

## Boundaries & Cross-Routing

- **Dual-license notice**: Editing or redistributing `src/serena` invokes `GPL-3.0-or-later`; `src/solidlsp` is `MIT`.
- **Route out**:
  - Zero-daemon fast symbol/text search -> `semble` / `codebase-search`
  - Persistent SQLite AST graph MCP -> `codebase-memory-mcp`
  - Multi-doc community clustering -> `graphify`
