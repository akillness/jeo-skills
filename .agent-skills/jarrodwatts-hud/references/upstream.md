# Upstream Provenance: `jarrodwatts/claude-hud`

- **Repository**: <https://github.com/jarrodwatts/claude-hud>
- **Pinned Commit**: `5fc08cbb610a7439993e40124637cbe193d60ea3` (`2026-11-23`)
- **License**: `MIT`
- **Version (`package.json` / `plugin.json`)**: `0.0.15`
- **Local Skill Name Rationale**: Named `jarrodwatts-hud` locally to pass reserved-word skill evaluator gates (`claude`) while preserving upstream `/claude-hud:setup` and plugin IDs verbatim.

## Installation & Runtime Requirements

- `/plugin marketplace add jarrodwatts/claude-hud`
- `/plugin install claude-hud`
- `/claude-hud:setup`
- **Requires Node.js**: Upstream notes explicitly that Bun alone is not sufficient because `hud.mjs` runs on Node.

## `hud.mjs` CLI Subcommands (`skills/hud/SKILL.md`)

- `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" doctor` — diagnose Node/config/statusLine registration
- `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" schema` — print config schema and valid options
- `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" preview` — render live sample HUD preview
- `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" set <path> <value>` — update `~/.claude/plugins/claude-hud/config.json`
- `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" install` / `report` — wire statusLine or generate diagnostic summary

## Cross-Routing

- Historical daily/monthly/5-hour-block token & cost reports -> `ccusage`
- Interactive TUI spend analytics -> `codeburn`
- Provider/API profile switching -> `cc-switch`
