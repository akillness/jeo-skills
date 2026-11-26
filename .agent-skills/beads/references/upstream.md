# Upstream Provenance: `gastownhall/beads`

- **Repository**: <https://github.com/gastownhall/beads>
- **Pinned Commit**: `78624109904655d7a4609f27d34eb0982cd8963f` (`2026-11-20`)
- **License**: `MIT`
- **Primary CLI**: `bd` (Go module `github.com/gastownhall/beads`)

## Installation Channels

- Homebrew: `brew install beads`
- npm wrapper: `npm install -g @beads/bd`
- Go install: `go install github.com/gastownhall/beads/cmd/bd@latest`
- Optional MCP integration: `integrations/beads-mcp` (`pip` / `uv`)

## Key Subcommands & Concepts

- **Hash-based IDs**: `bd-a1b2` (top-level) and `bd-a3f8.1` (hierarchical child tasks) prevent ID collisions across concurrent branches/agents.
- **Initialization**: `bd init`, `bd init --stealth` (local-only, excluded from git), `bd init --contributor` (OSS fork planning).
- **Agent integration**: `bd prime` (outputs minimal `~1-2k` token workflow digest), `bd setup claude`, `bd setup cursor`, `bd setup aider`.
- **Task queries & updates**:
  - `bd ready --json` — tasks with zero open blockers
  - `bd create "<title>" -t bug|feature|task -p 0..4 --json`
  - `bd show <id> --json`
  - `bd update <id> --claim --json`
  - `bd close <id> --reason "<reason>" --json`
- **Dependency types**: `blocks`, `related`, `parent-child`, `discovered-from` via `bd dep add <child> <parent>`.
- **Dolt & compaction**: `bd dolt status|start|push|pull` for cell-level merge/versioned sync; `bd compact` for semantic memory decay on closed tasks.

## Boundaries & Cross-Routing

- Gate `bd init` (shared repo writes), `bd dolt push`, and `bd compact` before executing.
- Route out:
  - Product specification templates -> `spec-kit`
  - Parallel Git worktree execution -> `orca`
  - Non-Dolt lightweight task checklists -> `task-planning`
