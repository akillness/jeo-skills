# CodeBurn command reference

Curated from the upstream README (`getagentseal/codeburn`). Most commands
accept `--provider`, `--project`/`--exclude`, and a period flag
(`-p today|week|30days|month|all|lifetime`) or `--from`/`--to`.

## Dashboard & reports

| Command | What it does |
|---|---|
| `codeburn` | Interactive TUI dashboard, last 7 days (default view) |
| `codeburn today` | Today's usage |
| `codeburn month` | This calendar month's usage |
| `codeburn overview` | Plain-text monthly summary, copy-pasteable (`--no-color`, `--from`/`--to`) |
| `codeburn report -p 30days` | Rolling 30-day window |
| `codeburn report -p all` | Every recorded session |
| `codeburn report --from 2026-04-01 --to 2026-04-10` | Exact date range |
| `codeburn report --format json` | Full dashboard data as JSON to stdout |
| `codeburn report --refresh 60` | Auto-refresh every 60s (`--refresh 0` disables) |

## Status & export

| Command | What it does |
|---|---|
| `codeburn status` | Compact one-liner: today + month totals |
| `codeburn status --format json` | Same totals as JSON |
| `codeburn export` | CSV covering today, 7 days, and 30 days |
| `codeburn export -f json` | Export as JSON instead of CSV |

## Analysis

| Command | What it does |
|---|---|
| `codeburn doctor` | Per-provider detection status: paths probed, sessions found, parse health (`--json`, `--provider`) |
| `codeburn audit` | Per provider-model token source table: where every number comes from |
| `codeburn context` | What fills a session's context window (interactive; Claude Code and Codex) |
| `codeburn context <id> --json` | Same context tree, scriptable |
| `codeburn optimize` | Scan for waste and print copy-paste fixes (last 30 days) |
| `codeburn optimize -p week` | Scope the waste scan to the last 7 days |
| `codeburn compare` | Side-by-side model comparison (one-shot rate, retries, cost/edit, cache hit) |
| `codeburn yield` | Productive vs reverted/abandoned spend, correlated against git commits by timestamp |
| `codeburn yield -p 30days` | Yield analysis for the last 30 days |

## Fix & control

| Command | What it does |
|---|---|
| `codeburn optimize --apply` | Interactively apply config-class fixes (`--yes`, `--dry-run`, `--only <ids>`) |
| `codeburn act list` | Every change CodeBurn has applied, newest first |
| `codeburn act undo <id>` | Roll a change back (`--last` for most recent, `--force` if files drifted) |
| `codeburn act report` | Realized vs estimated savings for applied fixes |
| `codeburn guard install` | Budget-cap hooks for Claude Code (`--global`, `--statusline`) |
| `codeburn guard status` | Show caps, install locations, and flagged projects |
| `codeburn guard allow` | Lift the hard cap for the current session |
| `codeburn guard uninstall` | Remove hooks cleanly, leaves other hooks alone |
| `codeburn mcp` | MCP server (stdio) exposing `get_usage` and `get_savings` to agents |

## Models

| Command | What it does |
|---|---|
| `codeburn models` | Per-model token + cost table (last 30 days) |
| `codeburn models --by-task` | Break each model into per-task-type rows |
| `codeburn models --by-agent` | Break each model into per-agent rows (`--min-cost 0` for sub-cent agents) |
| `codeburn models --top 10` | Only the 10 most expensive models |
| `codeburn models --format markdown` | Paste-friendly markdown table |
| `codeburn models --task feature` | Filter to feature-development work |

## Web & devices

| Command | What it does |
|---|---|
| `codeburn web` | Local browser dashboard with charts (http://localhost:4747, `--port`, `--no-open`) |
| `codeburn share --pair` | Share this device's usage to other paired devices (PIN pairing) |
| `codeburn devices add` | Find and pair a nearby device (or `add <host> --pin <pin>`) |
| `codeburn devices` | Combined usage totals across paired devices |
| `codeburn devices rm <name>` | Forget a device |

## Sync (team telemetry) — preview

| Command | What it does |
|---|---|
| `codeburn sync setup <url>` | One-time setup: OIDC login via browser, stores token securely |
| `codeburn sync push` | Push unsent usage to remote endpoint (default: last 7 days) |
| `codeburn sync push --since 30d` | Push a larger window |
| `codeburn sync status` | Show endpoint, auth state, last sync time |
| `codeburn sync logout` | Revoke token and remove credentials |
| `codeburn sync reset --confirm` | Clear sent-ledger (re-send all data on next push) |

Sync sends token counts, costs, models, and projects — never prompts or code.

## Plans, currency, pricing overrides

| Command | What it does |
|---|---|
| `codeburn plan set claude-max` | Track a Claude Max ($200/mo) subscription |
| `codeburn plan set custom --monthly-usd 200 --provider codex` | Custom provider plan |
| `codeburn plan` | Show configured plans |
| `codeburn plan reset [--provider <p>]` | Remove plan config |
| `codeburn currency GBP` | Set display currency (162 ISO 4217 codes supported) |
| `codeburn currency --reset` | Back to USD |
| `codeburn model-alias "proxy-name" "claude-opus-4-6"` | Map a proxy-rewritten model name to a known one |
| `codeburn model-alias --list` / `--remove <name>` | Manage aliases |
| `codeburn price-override my-model --input 0.27 --output 1.10` | Set exact USD/1M-token rates for a model |
| `codeburn model-savings "llama3.1:8b" gpt-4o` | Count a free local model's calls as savings vs a paid baseline |
| `codeburn proxy-path ~/work/copilot-repo` | Mark a project as subscription-covered (not API-billed) |

## Filtering flags (work across most commands)

| Flag | Effect |
|---|---|
| `--provider <name>` | Restrict to one tool, e.g. `claude`, `codex`, `cursor` |
| `--project <substr>` / `--exclude <substr>` | Case-insensitive project name filter (repeatable) |
| `-p today\|week\|30days\|month\|all\|lifetime` | Predefined period |
| `--from <date>` / `--to <date>` | Exact date range (either alone is valid) |
| `--format json\|markdown` | Structured output instead of the default table/TUI |

## TUI keyboard shortcuts

`q` quit · `1`–`6` period shortcuts (Today → Lifetime) · `c` open model
comparison · `o` open optimize · `p` toggle provider · `j`/`k` move one day
in the activity panel · `g`/`G` jump to either end.
