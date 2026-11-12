# Pinned upstream reference

| Field | Value |
|---|---|
| Repository | https://github.com/openonion/connectonion |
| Audited commit | `90028ca1a3a64f3d74b68bef3c5732860ccd5a83` (tag `v1.9.5`, "Release 1.9.5") |
| Package | `connectonion` on PyPI, version 1.9.5, `requires-python >=3.11` |
| License | Apache-2.0 (`LICENSE`; `connectonion/_licenses/` holds bundled third-party notices) |
| Entry point | `co` (Typer CLI, `connectonion/cli/`) |
| Docs | https://docs.connectonion.com, repo `docs/cli/*.md`, `docs/quickstart.md`, `docs/cli/audit.md` |

The audit used a source checkout of that commit plus a `co 1.9.5` install in a throwaway `HOME`; the help text of all 411 listed commands was captured and used for the effect classification in [command-catalog.md](command-catalog.md). No account, mailbox, or credential was used.

## What it is

ConnectOnion has two halves:
1. **The `co` CLI harness**: one command line that exposes accounts and tools (mail, calendar, drive, chat apps, a logged-in Chrome, files, other agents) so a coding agent needs no per-tool MCP server or plugin. `co commands` lists everything; each `--help` page states what the command changes and gives an example.
2. **A Python agent framework** (`connectonion/agent.py`, tool factory, event hooks, trust levels `open|careful|strict`, `@xray` debugging) used by `co create`/`co host`/`co deploy` projects. This skill covers the CLI; framework questions should be answered from upstream `AGENTS.md` and `docs/`.

`co rem` (experimental in 1.9.x) builds a local notebook of pages (people, organisations, projects, skills) from connected mail and coding sessions and keeps it updated on a schedule; data stays on the machine under `~/.co/rem`.

## Install routes (from `install.sh` and the README)

| Route | Command | What it changes |
|---|---|---|
| Upstream one-liner | `curl -fsSL https://raw.githubusercontent.com/openonion/connectonion/main/install.sh \| sh` | Installs `uv` if missing, runs `uv tool install --python ">=3.11" --force connectonion`, edits the shell PATH via `uv tool update-shell`, then runs **`co init --yes`** (identity, managed key, Codex/Claude skills and command index, REM with a daily scheduler). |
| Tool install only | `uv tool install --python ">=3.11" connectonion` | `co` on PATH; no global config until a `co` setup command runs. Derived from the installer script, not a documented upstream flag. |
| pip | `python3.11 -m venv .venv && .venv/bin/pip install connectonion` | Package only; run `co init` separately if wanted. |
| Preview | `... \| CO_VERSION=1.9.2b10 sh` | Pins a pre-release; same side effects as the one-liner. |

The one-liner pipes a remote script to a shell; never run it without the user's explicit approval, and prefer downloading and reading it first.

## Files and services `co` touches

- `~/.co/` — identity keys (`keys/`), `keys.env` (provider credentials), `agent.json`, `skills/`, `subs/`, `rem/`. `AGENT_CONFIG_PATH` relocates identity/profile/skills (not REM).
- `~/.codex/skills`, `~/.claude/skills`, `~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md` (between `<!-- co:begin <version> -->` markers), only if those homes exist.
- Project `.env`, `.co/host.yaml`, `.co/docs/`, `.co/admins.txt` for `co init ./` / `co create`.
- OpenOnion cloud (managed keys, credits, relay for agent addresses) and Google/Microsoft OAuth for mail/calendar/drive.
- OS scheduler (launchd on macOS, systemd user timer on Linux) for REM upkeep.

## Version caution

1.9.x marks `co rem`, `co claude`, `co slack`, `co discord`, `co mcp`, and `co tiktok` as experimental. When the installed version differs from 1.9.5, rely on `co commands` and each `--help` page, and note the drift in your report.
