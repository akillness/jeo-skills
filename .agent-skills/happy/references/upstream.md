# Upstream Provenance: `slopus/happy`

- **Repository**: <https://github.com/slopus/happy>
- **Pinned Commit**: `92826ef40fc96daec2ac87e975ce14ff00ad3a43` (`2026-11-26`)
- **License**: `MIT`
- **npm Package (`packages/happy-cli/package.json`)**: `happy` (`0.13.0`, migrated from `happy-coder`)

## Monorepo Packages

- `packages/happy-cli`: CLI binaries `happy` and `happy-mcp` (`happy`, `happy claude`, `happy codex`)
- `packages/happy-app`: Expo iOS / Android / Web encrypted client
- `packages/happy-server`: Relay backend server
- `packages/happy-wire` / `packages/happy-agent`: Shared wire schemas and daemon helpers

## Security & Operational Boundaries

- End-to-end encryption uses device-held keys (TweetNaCl); never leak QR pairing tokens or local key state.
- Mobile approval prompts still trigger real local tool executions on the host — maintain strict directory/git safety.
- Gate self-hosted `happy-server` deployment behind TLS and explicit infrastructure confirmation.

## Cross-Routing

- Multi-worktree desktop orchestration -> `orca`
- Multi-CLI provider & MCP config switching -> `cc-switch`
- In-terminal statusline HUD -> `jarrodwatts-hud`
