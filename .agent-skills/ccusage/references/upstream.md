# Upstream Provenance: `ccusage/ccusage`

- **Repository**: <https://github.com/ccusage/ccusage>
- **Pinned Commit**: `98b9dbd84a534b594e6bbd76f7511bed43a87771` (`2026-11-26`)
- **License**: `MIT`
- **Version (`apps/ccusage/package.json`)**: `20.1.2`

## Monorepo Apps (`apps/`)

- `apps/ccusage` (`ccusage`): unified CLI supporting `claude`, `codex`, `opencode`, `amp`, `droid`, `pi`, `copilot`, `gemini`, `antigravity` via `--sources`
- `apps/codex` (`@ccusage/codex`), `apps/opencode`, `apps/pi`, `apps/amp`, `apps/mcp` (`@ccusage/mcp`)

## Core Subcommands & Flags

- Subcommands: `daily`, `weekly`, `monthly`, `session`, `blocks`, `statusline`
- Flags: `--json`, `--breakdown`, `--since YYYYMMDD`, `--until YYYYMMDD`, `--offline`, `--instances`, `--project`, `--sources ...`, `--live`, `--active`, `--token-limit`
- Note: Root `README.md` in upstream is a symlink to `./apps/ccusage/README.md`, so `source.json` pins the direct regular file `apps/ccusage/README.md` instead of the symlink.

## Boundaries & Cross-Routing

- Cost outputs are local JSONL + cached LiteLLM pricing estimates; use `--offline` to block external pricing fetches.
- Route live in-session Claude Code statusline HUD to `jarrodwatts-hud`, dedicated TUI budgeting to `codeburn`, and provider switching to `cc-switch`.
