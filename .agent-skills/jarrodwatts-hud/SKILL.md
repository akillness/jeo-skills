---
name: jarrodwatts-hud
description: >
  Configure jarrodwatts/claude-hud, a live statusline HUD plugin for Claude Code displaying context window %, active model/usage limits, git dirty/ahead/behind status, running tools, subagents, todos, and session speed via native statusline JSON and transcript JSONL without consuming model context tokens. Use when installing claude-hud, tuning ~/.claude/plugins/claude-hud/config.json presets via hud.mjs, or running doctor diagnostics. Do not use for historical cost reports (route to ccusage or codeburn). Triggers on: claude-hud, jarrodwatts-hud, statusline hud, hud.mjs, /claude-hud:setup.
allowed-tools: Read Glob Grep Bash
compatibility: Claude Code plugin runtime and Node.js (Bun alone is not supported by upstream hud.mjs). Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "0.0.15"
  source: https://github.com/jarrodwatts/claude-hud
  upstream_commit: 5fc08cbb610a7439993e40124637cbe193d60ea3
  pinned_at: "2026-11-23"
---

# jarrodwatts-hud (`jarrodwatts/claude-hud`)

Source-pinned operator guide for `jarrodwatts/claude-hud` (`v0.0.15`, MIT). Note that this package uses the local name `jarrodwatts-hud` to comply with reserved-word skill evaluator checks (`claude`) while targeting `claude-hud` verbatim.

## When to use this skill

- Installing `claude-hud` in Claude Code (`/plugin marketplace add jarrodwatts/claude-hud`, `/plugin install claude-hud`, `/claude-hud:setup`).
- Configuring HUD presets (`minimal`, `essential`, `full`), layout options (`compact`, `expanded`), git status indicators, or custom display lines (`~/.claude/plugins/claude-hud/config.json`).
- Running `hud.mjs` maintenance commands (`doctor`, `schema`, `preview`, `set`, `install`, `report`) documented in upstream `skills/hud/SKILL.md`.
- Troubleshooting why the HUD fails to render when `node` is missing or only `bun` is installed.
- Routing out: use `ccusage` for daily/weekly/monthly token & cost JSONL reports, `codeburn` for interactive cost TUI dashboards, and `cc-switch` for provider profile switching.

## Instructions

1. **Run offline preflight first** to confirm `node`, `git`, and `claude` are available on `PATH`:
   ```bash
   python3 scripts/preflight.py --json
   ```
   **Critical upstream caveat**: `hud.mjs` requires **Node.js** on `PATH` (`Bun alone is not enough: the HUD runs its logic on Node`).

2. **Install and initialize the plugin in Claude Code**:
   - `/plugin marketplace add jarrodwatts/claude-hud`
   - `/plugin install claude-hud`
   - `/claude-hud:setup`

3. **Inspect, preview, and update HUD settings safely via `hud.mjs`**:
   - Run diagnostics: `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" doctor`
   - Inspect config schema & defaults: `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" schema`
   - Preview layout cleanly before saving: `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" preview`
   - Update individual keys safely: `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" set <dot.path> <value>` (persisted to `~/.claude/plugins/claude-hud/config.json`).

4. **Preserve statusline and privacy boundaries**:
   - Confirm before overwriting custom existing `statusLine` entries in `~/.claude/settings.json`.
   - When capturing diagnostics via `report`, redact project directory paths or branch names if sensitive before sharing publicly.

## Examples

- **Diagnose blank statusline**:
  Run `python3 scripts/preflight.py --json` to confirm `node` is installed -> run `node "${CLAUDE_PLUGIN_ROOT}/hud.mjs" doctor` -> re-run `/claude-hud:setup` if `statusLine` hook entry is missing.
- **Enable git ahead/behind and compact layout**:
  Check valid keys via `hud.mjs schema` -> apply via `hud.mjs set ...` -> confirm visual output with `hud.mjs preview`.

## Best practices

- Prefer `hud.mjs set` and `hud.mjs preview` over hand-editing `~/.claude/plugins/claude-hud/config.json` blindly so schema types stay valid.
- Remember that `claude-hud` runs out-of-band via Claude Code's `statusLine` hook and reads local JSONL transcripts, consuming zero tokens from the LLM context window.

## References

- Pinned upstream HUD architecture and `hud.mjs` subcommands: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
