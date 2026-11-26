---
name: ccusage
description: >
  Run ccusage/ccusage to analyze local coding-agent JSONL session logs and generate daily, weekly, monthly, per-session, and 5-hour billing block token and cost reports across Claude Code, Codex, OpenCode, Amp, Pi, Copilot, Gemini, and Antigravity. Use when running npx ccusage@latest daily/monthly/blocks/statusline, exporting --json cost breakdowns, or checking --live 5-hour billing windows with --offline pricing cache. Do not use for live in-session HUD rendering (route to jarrodwatts-hud) or provider switching (route to cc-switch). Triggers on: ccusage, token usage report, billing blocks, ccusage daily, ccusage --json.
allowed-tools: Read Glob Grep Bash
compatibility: Node.js (>=20.19) or Bun via npx ccusage@latest / bunx ccusage / Homebrew ryoppippi/tap/ccusage. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "20.1.2"
  source: https://github.com/ccusage/ccusage
  upstream_commit: 98b9dbd84a534b594e6bbd76f7511bed43a87771
  pinned_at: "2026-11-26"
---

# ccusage (`ccusage/ccusage`)

Source-pinned operator guide for `ccusage/ccusage` (`ccusage v20.1.2`, MIT), a local-first CLI and monorepo suite (`apps/ccusage`, `apps/codex`, `apps/opencode`, `apps/pi`, `apps/amp`, `apps/mcp`) for analyzing token consumption and estimated USD cost from local session logs.

## When to use this skill

- Running `daily`, `weekly`, `monthly`, `session`, `blocks`, or beta `statusline` usage reports via `npx ccusage@latest` or `bunx ccusage`.
- Aggregating multi-agent usage across `--sources claude,codex,opencode,amp,droid,pi,copilot,gemini,antigravity` or per-project `--instances`.
- Exporting machine-readable `--json` metrics, per-model `--breakdown` tables, or `--since`/`--until YYYYMMDD` date windows.
- Monitoring live 5-hour billing windows (`ccusage blocks --live`) or integrating `@ccusage/mcp` (`apps/mcp`).
- Routing out: use `jarrodwatts-hud` for live HUD statuslines inside Claude Code, `codeburn` for dedicated interactive TUI budgeting, and `cc-switch` for API provider switching.

## Instructions

1. **Run offline preflight first** to confirm `node`, `npx`, `bunx`, or installed `ccusage`:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Choose the appropriate subcommand and source filter**:
   - Daily / weekly / monthly summaries:
     ```bash
     npx ccusage@latest daily --breakdown
     npx ccusage@latest monthly --json
     ```
   - Per-session & project breakdown: `npx ccusage@latest session --instances`
   - 5-hour billing window monitor: `npx ccusage@latest blocks --active` (or `--live` for real-time refresh)
   - Multi-agent unified view (`v20+`): `npx ccusage@latest daily --sources claude,codex,opencode`

3. **Respect offline, pricing-estimate, and privacy boundaries**:
   - Use `--offline` in restricted/airgapped environments or CI pipelines so `ccusage` relies on cached LiteLLM pricing tables instead of fetching prices over the network.
   - Treat calculated USD costs as estimates derived from local JSONL token counts and cached model pricing; verify final billing against provider invoices.
   - Pass `--json` when scripting downstream reports, and redact workspace/project names before posting `session` or `--instances` exports publicly.

4. **Check dedicated sibling apps or MCP server when needed**:
   - Sibling CLIs in `ccusage/ccusage`: `@ccusage/codex`, `@ccusage/opencode`, `@ccusage/pi`, `@ccusage/amp`, and `@ccusage/mcp` (`apps/mcp`).
   - Confirm before installing global packages or registering `@ccusage/mcp` into shared host configs.

## Examples

- **Airgapped monthly multi-agent cost export**:
  `npx ccusage@latest monthly --offline --json --breakdown --sources claude,codex,opencode`
- **Track active 5-hour block burn rate**:
  `npx ccusage@latest blocks --live --token-limit max`
- **Date-filtered project audit**:
  `npx ccusage@latest daily --since 20261101 --until 20261126 --instances`

## Best practices

- Prefer `--offline` when deterministic speed or zero outbound pricing fetches matter.
- Use `--json` instead of scraping ANSI Unicode tables in scripts or dashboards.
- Pair `ccusage` (retrospective/block spend analytics) with `jarrodwatts-hud` (live in-session context & git HUD) rather than treating them as duplicates.

## References

- Pinned upstream subcommands, flags, and monorepo apps: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
