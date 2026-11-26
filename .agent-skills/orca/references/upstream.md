# Upstream Provenance: `stablyai/orca`

- **Repository**: <https://github.com/stablyai/orca>
- **Pinned Commit**: `687383b94b9453d52e3dc368a87465a7ce5ebc58` (`2026-11-26`)
- **License**: `MIT`
- **Installation**: `brew install --cask orca` (`Casks/orca.rb`) or local Electron/CLI build (`pnpm`)

## CLI Command Modules (`src/cli/index.ts`, `src/cli/specs/`)

- Core: `orca open`, `orca status --json`, `orca diagnostics`, `orca runtime`
- Worktrees & Projects: `orca worktree create --name ... --repo ... --agent ... --prompt ...`, `orca projects`, `orca workspaces`, `orca files`
- Multi-Agent Execution: `orca agents`, `orca orchestration`, `orca dispatch`, `orca terminals`, `orca session-search`
- Integrations & Remote: `orca server`, `orca bots`, `orca slack`, `orca linear`, `orca jira`, `orca webhooks`, `orca automations`, `orca mcp`, `orca plugins`, `orca skills`, `orca profiles`, `orca accounts`

## Boundaries & Cross-Routing

- Gate `orca server`, `orca webhooks`, Slack/Linear/Jira bot connections, and destructive worktree deletion behind explicit user approval.
- Route mobile E2E remote session control (`happy claude`) to `happy`; route swarm hooks/memory to `ruflo`; route standard manual Git branch ops to `git-workflow`.
