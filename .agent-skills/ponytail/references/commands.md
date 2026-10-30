# Ponytail — install, commands and settings by host

Pinned to Ponytail 5.3.3 (`DietrichGebert/ponytail` at
`7801d061243d7b753bad0e0b3c057cd250b11755`, MIT). Upstream `INSTALL.md` at that
commit is the source for every line below.

## Pick one source per host

| Source | What you get |
|---|---|
| This catalog skill (`npx skills add https://github.com/akillness/jeo-skills --skill ponytail`) | One instruction-only skill: the rules plus the five commands as prose. No hooks, no persistent level. |
| Upstream plugin (table below) | The same rules injected every turn, persistent levels, subagent injection, six upstream skills, and in Claude Code the band. Needs `node` on the non-interactive PATH for the Claude Code, Codex and Cursor hooks. |
| Upstream skills CLI (`npx skills add DietrichGebert/ponytail`) | The six upstream skills. Writes the same `ponytail` folder as this catalog skill, so the later install replaces the earlier one. |

## Upstream plugin by host

| Host | Install | Then |
|---|---|---|
| Claude Code | `claude plugin marketplace add DietrichGebert/ponytail` and `claude plugin install ponytail@ponytail` (in a session: the two `/plugin` commands as separate prompts) | CodeBuddy uses the same two `/plugin` commands. |
| Codex (CLI and desktop) | `codex plugin marketplace add DietrichGebert/ponytail` and `codex plugin add ponytail@ponytail` | Open `/hooks`, trust the two lifecycle hooks, start a new thread; restart the desktop app. |
| GitHub Copilot CLI | `copilot plugin marketplace add DietrichGebert/ponytail` and `copilot plugin install ponytail@ponytail` | Commands are namespaced: `/ponytail:ponytail ultra`. |
| Gemini CLI | `gemini extensions install https://github.com/DietrichGebert/ponytail` | Always-on context plus `/ponytail` commands. |
| Qwen Code | `qwen extensions install DietrichGebert/ponytail:ponytail` | Levels do not persist. |
| Pi | `pi install git:github.com/DietrichGebert/ponytail` | |
| Oh My Pi (omp) | `omp plugin marketplace add DietrichGebert/ponytail` and `omp plugin install ponytail@ponytail` | Start a new session. |
| OpenCode 2 | `opencode plugin add @dietrichgebert/ponytail`, or `{ "plugins": ["@dietrichgebert/ponytail"] }` in `opencode.json` | From a checkout use the directory `{ "plugins": ["./.opencode/plugins"] }`; a path to `ponytail.mjs` is rejected. |
| OpenCode 1 / Kilo Code | `{ "plugin": ["@dietrichgebert/ponytail"] }` in `opencode.json` / `kilo.jsonc` | OpenCode 1 has no `plugin add`. |
| Antigravity CLI | `agy plugin install https://github.com/DietrichGebert/ponytail` | Copy `AGENTS.md` for the always-on rules. |
| Hermes Agent | `hermes plugins install DietrichGebert/ponytail --enable` | If the schema check refuses it: `git clone https://github.com/DietrichGebert/ponytail.git ~/.hermes/plugins/ponytail && hermes plugins enable ponytail`; restart. |
| Devin CLI | `devin plugins install DietrichGebert/ponytail` | Skills as `/ponytail:ponytail-review`. |
| Grok Build | `grok plugin install DietrichGebert/ponytail --trust` | Enable it under `/plugins` or `[plugins] enabled = ["ponytail"]` in `~/.grok/config.toml`. |
| Goose | `goose plugin install https://github.com/DietrichGebert/ponytail.git` | Copy `AGENTS.md` to `~/.agents/AGENTS.md` for the always-on rules. |
| OpenClaw | `clawhub install ponytail` (and `ponytail-review`, `-audit`, `-debt`, `-gain`, `-help`) | |
| Kimi Code | In a session: `/plugins install https://github.com/DietrichGebert/ponytail`, then `/reload` | No persistent level. |
| Qoder | `qodercli plugins install <path-to-ponytail>` for hooks; otherwise it reads `AGENTS.md` | |
| Cursor | `git clone https://github.com/DietrichGebert/ponytail && node ponytail/scripts/cursor-hooks.js install` (add `--project` for one project) | Hooks and the `.cursor/rules/ponytail.mdc` rule are alternatives. |

Rules-file hosts (no commands): copy the matching file from the pinned upstream
tree — Cursor `.cursor/rules/ponytail.mdc`, Windsurf `.windsurf/rules/`, Cline
`.clinerules/`, Copilot Chat `.github/copilot-instructions.md`, Kiro
`.kiro/steering/ponytail.md`, Qoder `.qoder/rules/`, and `AGENTS.md` for Aider,
Zed, Amp, Jules, Junie, CodeWhale and the Codex VS Code extension.

## Commands

| Command | What it does |
|---|---|
| `/ponytail [lite\|full\|ultra\|off]` | Set the level; no argument turns it on or reports the level. |
| `/ponytail band [on\|off]`, `/ponytail band import` | Claude Code plugin only: the cost/time/tests band and the local board. |
| `/ponytail-review` | Quality review of a change: correct, safe, load, tested, fast, lean. |
| `/ponytail-audit` | The same review for a folder or the whole repo, ranked, at most 20 findings. |
| `/ponytail-debt` | Ledger of `shortcut:` (and older `ponytail:`) comments. |
| `/ponytail-gain` | Benchmark scoreboard; never a per-repo saving. |
| `/ponytail-help` | Quick reference. |

Invocation differs by host: Codex `$ponytail:ponytail-review`; Copilot CLI and
Devin `/ponytail:ponytail-review`; Hermes registers `ponytail:<skill>`; Cursor
hooks accept `/ponytail <level>` as a plain message only.

## Settings

Default level for new sessions: `PONYTAIL_DEFAULT_MODE` (`lite`/`full`/`ultra`/`off`),
else `defaultMode` in `~/.config/ponytail/config.json`
(`%APPDATA%\ponytail\config.json` on Windows), else `full`.
`PONYTAIL_SUBAGENT_MATCHER` limits subagent injection to agent types matching a
case-insensitive regex.

## Uninstall

| Host | Command |
|---|---|
| Claude Code | `/plugin remove ponytail` |
| Codex | `codex plugin remove ponytail` |
| Devin CLI | `devin plugins remove ponytail` |
| Grok Build | `grok plugin uninstall ponytail` |
| Pi | `pi uninstall ponytail` |
| omp | `omp plugin uninstall ponytail@ponytail`, then `omp plugin marketplace remove ponytail` |
| OpenCode | `opencode plugin remove @dietrichgebert/ponytail` |
| Cursor hooks | `node scripts/cursor-hooks.js uninstall` |
| Skills CLI | `npx skills remove ponytail ponytail-audit ponytail-debt ponytail-gain ponytail-help ponytail-review` |
| This catalog skill | `npx skills remove ponytail` (same `--agent` / `--global` flags as the install) |

Plugin removal leaves the mode flag (`~/.claude/.ponytail-active`),
`~/.config/ponytail/config.json` and the statusline script copy. Run upstream
`node scripts/uninstall.js` before the host remove command to clean them up.
