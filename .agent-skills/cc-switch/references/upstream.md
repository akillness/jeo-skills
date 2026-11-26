# Upstream Provenance: `farion1231/cc-switch`

- **Repository**: <https://github.com/farion1231/cc-switch>
- **Pinned Commit**: `754fed72d428c66c1e6ed45f38601ac25ded90c6` (`2026-11-26`)
- **License**: `MIT`
- **Version (`package.json` / `src-tauri/Cargo.toml`)**: `3.13.0`

## Supported Coding-Agent Hosts & Live Config Targets

- **Claude Code**: `~/.claude/settings.json`, `~/.claude/skills/`
- **Codex**: `~/.codex/auth.json`, `~/.codex/config.toml`, `~/.codex/skills/`
- **Gemini CLI**: `~/.gemini/.env`, `~/.gemini/settings.json`, `~/.gemini/skills/`
- **OpenCode / OpenClaw**: unified provider, MCP, prompt, and `~/.config/opencode/skills/` sync

## Storage & Architecture (`v3.7+`)

- Primary database: `~/.cc-switch/cc-switch.db` (SQLite)
- Settings mirror: `~/.cc-switch/settings.json`
- Features: one-click provider switching, latency speed testing, local HTTP proxy + auto-failover queue + circuit breaker, unified MCP/Skills/Prompts management, WebDAV sync, `ccswitch://` deep links.

## Security & Operational Boundaries

- **Secret handling**: Never print or commit `~/.cc-switch/cc-switch.db`, `~/.codex/auth.json`, or API tokens.
- **Backup before mutating**: Back up existing live `~/.claude/`, `~/.codex/`, `~/.gemini/` files prior to initial import or proxy takeover.
- **Route out**: Token/cost analytics -> `ccusage`; live HUD -> `jarrodwatts-hud`; encrypted mobile control -> `happy`.
