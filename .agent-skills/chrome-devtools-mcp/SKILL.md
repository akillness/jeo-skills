---
name: chrome-devtools-mcp
description: >
  Operate ChromeDevTools/chrome-devtools-mcp, the official Chrome DevTools MCP server and standalone chrome-devtools CLI for live browser DOM, console, network, Lighthouse, and performance trace inspection. Use when configuring chrome-devtools-mcp flags (--browserUrl, --autoConnect, --headless, --isolated, --slim), running chrome-devtools CLI commands, or recording performance traces. Do not use on local macOS when Aside browser priority applies first (route to aside-browser) or for full Playwright test suites (route to playwright-cli). Triggers on: chrome-devtools-mcp, chrome-devtools cli, devtools trace, --autoConnect, --browserUrl, lighthouse_audit.
allowed-tools: Read Glob Grep Bash
compatibility: Node.js LTS (v20.19+) and Google Chrome stable/canary/beta/dev. Preflight runs offline in Python 3.10+.
license: Apache-2.0
metadata:
  version: "0.21.0"
  source: https://github.com/ChromeDevTools/chrome-devtools-mcp
  upstream_commit: faa6c871208279c485a1fd926f92f5363435af4a
  pinned_at: "2026-11-26"
---

# Chrome DevTools MCP (`ChromeDevTools/chrome-devtools-mcp`)

Source-pinned operator guide for `ChromeDevTools/chrome-devtools-mcp` (`Apache-2.0`), providing both an MCP server (`chrome-devtools-mcp`) and a standalone daemon CLI (`chrome-devtools`).

## When to use this skill

- Wiring `npx -y chrome-devtools-mcp@latest` into an agent host (Claude Code, Codex, Cursor, Gemini CLI, Copilot) with explicit safety/profile flags.
- Running standalone `npx -y chrome-devtools@latest` shell sessions (`start`, `status`, direct tool invocations) without keeping all 20+ MCP tools loaded in context.
- Capturing live Chrome console logs, network requests, accessibility snapshots (`take_snapshot`), Lighthouse audits, and CPU/LCP performance traces (`performance_start_trace` -> `performance_stop_trace` -> `performance_analyze_insight`).
- Routing out: follow local browser priority (`aside-browser` first on macOS, then `moli`, `browser-use`, `browser-harness`, `playwriter`), and route multi-file Playwright test suites to `playwright-cli`.

## Instructions

1. **Run offline preflight first** to inspect `node`, `npx`, and installed Chrome DevTools binaries:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Choose MCP server vs standalone CLI mode deliberately**:
   - **MCP server**: `npx -y chrome-devtools-mcp@latest` (use `--slim` to expose only the core lightweight tool set when token budget is tight).
   - **Standalone CLI**: `npx -y chrome-devtools@latest start` / `chrome-devtools status` / `chrome-devtools <tool>` (avoids permanent MCP schema bloat).
   - Limit tool categories via `--categoryEmulation=false`, `--categoryPerformance`, `--categoryNetwork` as documented in `docs/configuration.md`.

3. **Enforce profile, privacy, and telemetry flags**:
   - Default to isolated ephemeral profiles (`--isolated` or `--headless --isolated`) when automating untrusted sites.
   - **Never** attach `--autoConnect` (Chrome 144+ remote debugging) or `--browserUrl` / `--wsEndpoint` to a personal Chrome profile holding active bank/production/OAuth cookies unless the user explicitly approves attaching to that live session.
   - Disable telemetry and external CrUX field-data requests in private/regulated audits:
     `--no-usage-statistics --no-performance-crux`
   - Never pass `--no-sandbox` or `--accept-insecure-certs` without explicit risk sign-off.

4. **Run targeted diagnostics and clean up**:
   - Prefer `take_snapshot` (accessibility tree with UIDs) over raw full-page HTML dumps.
   - For performance audits, pair `performance_start_trace(reload=true, autoStop=true)` with `performance_analyze_insight`.
   - Close or stop background `chrome-devtools` sessions when diagnostics complete.

## Examples

- **Privacy-hardened headless MCP config**:
  `npx -y chrome-devtools-mcp@latest --headless --isolated --no-usage-statistics --no-performance-crux`
- **Attach to an explicit local debug port for a dev app**:
  Start dev Chrome with `--remote-debugging-port=9222 --user-data-dir=/tmp/cdp-dev`, then run `npx -y chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9222`.
- **Standalone CLI performance trace**:
  Run `npx -y chrome-devtools@latest start --isolated --headless`, execute `navigate_page` + `performance_start_trace`, then inspect `list_network_requests` / `list_console_messages`.

## Best practices

- Use `--slim` or disable unused `--category-*` flags when running alongside multiple other MCP servers.
- Always pair `--isolated` with temporary directories when testing untrusted external pages.
- Respect local browser routing priority (`aside-browser` > `moli` > `browser-use` > `browser-harness` > `playwriter`) unless the user explicitly requests DevTools MCP traces, network waterfalls, or Lighthouse audits.

## References

- Pinned upstream CLI, flags, and tool categories: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
