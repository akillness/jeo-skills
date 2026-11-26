---
name: cc-switch
description: >
  Manage farion1231/cc-switch, a cross-platform desktop and config manager for switching API providers, MCP servers, Skills, system prompts, and local failover proxies across Claude Code, Codex, Gemini CLI, OpenCode, and OpenClaw. Use when installing CC Switch (brew install --cask cc-switch), backing up or migrating ~/.cc-switch/cc-switch.db, configuring multi-CLI MCP/Skills sync, or troubleshooting local proxy failover endpoints. Do not use for historical token cost analytics (route to ccusage) or terminal statusline HUDs (route to jarrodwatts-hud). Triggers on: cc-switch, farion1231/cc-switch, provider switcher, cc-switch.db, failover proxy.
allowed-tools: Read Glob Grep Bash
compatibility: macOS (brew install --cask cc-switch via farion1231/homebrew-ccswitch), Windows, or Linux Tauri desktop app. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "3.13.0"
  source: https://github.com/farion1231/cc-switch
  upstream_commit: 754fed72d428c66c1e6ed45f38601ac25ded90c6
  pinned_at: "2026-11-26"
---

# CC Switch (`farion1231/cc-switch`)

Source-pinned operator guide for `farion1231/cc-switch` (`v3.13.0`, MIT), an all-in-one Tauri desktop manager that unifies provider profiles, MCP configs, Skills, Prompts, and local HTTP failover proxying across **Claude Code, Codex, Gemini CLI, OpenCode, and OpenClaw**.

## When to use this skill

- Installing or upgrading CC Switch (`brew tap farion1231/ccswitch && brew install --cask cc-switch` on macOS, or official Windows/Linux releases).
- Understanding CC Switch's SQLite + JSON storage architecture (`~/.cc-switch/cc-switch.db` + `~/.cc-switch/settings.json`) and how switching updates live CLI files (`~/.claude/settings.json`, `~/.codex/auth.json`, `~/.codex/config.toml`, `~/.gemini/.env`, OpenCode/OpenClaw configs).
- Configuring unified MCP synchronization, Skills discovery across `~/.claude/skills/`, `~/.codex/skills/`, `~/.gemini/skills/`, `~/.config/opencode/skills/`, or local proxy auto-failover & circuit breakers.
- Routing out: use `ccusage` for local JSONL token/cost reports, `jarrodwatts-hud` for live statusline HUDs, and `happy` for encrypted mobile remote control.

## Instructions

1. **Run offline preflight first** to inspect host CLI tools and SQLite availability:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Install CC Switch safely and snapshot live configs BEFORE switching**:
   - macOS Homebrew tap:
     ```bash
     brew tap farion1231/ccswitch
     brew install --cask cc-switch
     ```
   - Before importing or applying provider switches for the first time, back up existing live configs (`~/.claude/settings.json`, `~/.codex/auth.json`, `~/.codex/config.toml`, `~/.gemini/.env`, `~/.gemini/settings.json`, OpenCode/OpenClaw configs) so manual rollback is trivial.

3. **Respect the SQLite SSOT and live-sync model (v3.7+)**:
   - Provider records, MCP definitions, prompts, and proxy settings live in SQLite (`~/.cc-switch/cc-switch.db`), while local preferences mirror to `~/.cc-switch/settings.json`.
   - Switching a provider writes atomically to the active tool's live configuration files. When using CC Switch's local proxy takeover/auto-failover mode, note that live configs point `ANTHROPIC_BASE_URL` / provider endpoints to the local CC Switch proxy while active.

4. **Enforce strict secret and backup hygiene**:
   - **Never** dump, echo, log, or commit API keys, `auth.json`, `.env`, or `~/.cc-switch/cc-switch.db` contents into chat output, skill files, or repositories.
   - Require explicit user confirmation before overwriting live `~/.claude/`, `~/.codex/`, `~/.gemini/`, or WebDAV sync targets, or importing `ccswitch://` deep links from untrusted sources.

## Examples

- **Pre-switch backup and verification**:
  Copy `~/.claude/settings.json` and `~/.codex/config.toml` to a private timestamped backup directory outside git -> open CC Switch -> test endpoint latency -> switch active provider.
- **Triage broken CLI auth after stopping CC Switch proxy**:
  Inspect whether live `~/.claude/settings.json` still points `ANTHROPIC_BASE_URL` to localhost proxy port; disable proxy takeover in CC Switch or restore the backed-up live provider profile.

## Best practices

- Never inspect or print raw API token values when diagnosing config sync issues; inspect only key names (`base_url`, model names, schema keys).
- Keep WebDAV / cloud database backups encrypted or private, since `cc-switch.db` stores provider credentials.
- Avoid simultaneously running another config-rewriting manager against the same live `~/.claude/` or `~/.codex/` files without coordination.

## References

- Pinned upstream features, config file targets, and storage notes: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
