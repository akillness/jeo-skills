# Upstream Provenance: `ChromeDevTools/chrome-devtools-mcp`

- **Repository**: <https://github.com/ChromeDevTools/chrome-devtools-mcp>
- **Pinned Commit**: `faa6c871208279c485a1fd926f92f5363435af4a` (`2026-11-26`)
- **License**: `Apache-2.0`
- **Binaries (`package.json`)**: `chrome-devtools-mcp` (MCP server) and `chrome-devtools` (standalone CLI)

## Key CLI & Configuration Flags (`docs/configuration.md`, `docs/cli.md`)

- **Browser target**: `--channel stable|canary|beta|dev`, `--executablePath`, `--browserUrl` / `--browser-url`, `--wsEndpoint`, `--autoConnect` (Chrome 144+)
- **Isolation & Headless**: `--headless`, `--isolated` (temp profile cleaned on close), `--userDataDir`
- **Context & Categories**: `--slim` (minimal 3-tool mode), `--categoryEmulation`, `--categoryPerformance`, `--categoryNetwork`
- **Privacy & Security**: `--no-usage-statistics` (disable usage telemetry), `--no-performance-crux` (disable Chrome UX Report API calls), `--acceptInsecureCerts` (danger: gated), `--chromeArg`

## Core Tool Categories (`docs/tool-reference.md`)

- **Input**: `click`, `fill`, `fill_form`, `hover`, `press_key`, `upload_file`, `drag`
- **Navigation**: `navigate_page`, `new_page`, `list_pages`, `select_page`, `close_page`, `wait_for`
- **Debugging**: `take_snapshot`, `take_screenshot`, `evaluate_script`, `list_console_messages`, `get_console_message`
- **Network**: `list_network_requests`, `get_network_request`
- **Performance & Audits**: `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`, `lighthouse_audit`, `take_memory_snapshot`

## Boundaries & Cross-Routing

- **Safety**: Never attach `--autoConnect` or `--browserUrl` to a daily-driver browser holding sensitive personal/auth sessions without explicit user consent.
- **Route out**:
  - Local macOS Aside priority -> `aside-browser`
  - Playwright E2E test suites -> `playwright-cli`
  - Lightweight headless DOM fetch -> `lightpanda` / `moli`
