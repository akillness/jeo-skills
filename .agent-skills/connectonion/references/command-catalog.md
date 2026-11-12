# `co` command catalog (audited at 1.9.5)

Source: `co commands` and the `--help` page of each of the 411 listed commands from `co 1.9.5` run in a throwaway `HOME`. Tiers match the table in [SKILL.md](../SKILL.md). **If the installed version differs, re-run `co commands` and trust it over this file.** A group's tier is the highest tier among its subcommands; run the narrowest subcommand and read its `--help` "Effects" text.

Discovery commands (tier 1): `co` (top-level list), `co commands`, `co <group> --help`, `co <group> <sub> --help`, `co --version`, `co doctor`, `co status`, `co approvals`, `co env show`, `co env path`.

## Account and setup

| Command | Does | Tier |
|---|---|---|
| `co init` | Global: identity in `~/.co/keys`, managed-key login, `~/.co/agent.json`, Codex/Claude skills + command-index blocks, may install Codex and open a browser login, REM build + daily scheduler. `co init ./` = project setup. `--no-rem` skips REM. | 4 |
| `co create <name>` | New project directory; also completes local identity, skill links, and command indexes. | 4 |
| `co setup` | Customize local profile and import skill library; refreshes the same links/indexes. | 4 |
| `co auth` | `login/status/logout` for OpenOnion; `co auth google` / `co auth microsoft` open an OAuth grant for mail, calendar, drive. `status` is read-only. | 1 (`status`) / 4 |
| `co keys` | Shows keys; `--reveal` prints secrets; `--ssh --write` writes `~/.co/ssh/`. | 1, never `--reveal` |
| `co env` | `show/path/get` read; `set/rotate/unset` edit `~/.co/keys.env` (or `--env-file`). `get`/`--reveal` expose values. | 1 / 4 |
| `co status`, `co doctor` | Balance, account, credential sources / installation diagnosis. `doctor --fix` changes the browser runtime. | 1 (`--fix`: 4) |
| `co reset` | Destructive account reset: deletes `~/.co/keys/` and `~/.co/keys.env`, creates a new account. | 4 |
| `co transfer` | Sends credits to another agent address irreversibly (`list` is read-only). | 3 |
| `co announce` | Publishes the agent profile and SKILL list from `~/.co/agent.json` to the public relay. | 3 |

## Mail, calendar, drive, notes

| Group | Subcommands | Tier |
|---|---|---|
| `co gmail` | inbox, read, search, sent, attachments, download, unanswered (read); **send** (immediate, no preview), reply, draft, mark, archive, star, label (write) | 2 / 3 |
| `co outlook` | inbox, read, search, sent, download, drafts, contact, calendar (read); send, reply, send-draft, delete-draft, scheduled, cancel (write) | 2 / 3 |
| `co email` | `co email` agent mailbox (`*@mail.openonion.ai`): inbox, read, search, send, reply, forward, share, delete-history, domains, upgrade | 2 / 3 / 4 (`delete-history`, `upgrade`, `domains`) |
| `co gcalendar` | list, today, read, meetings, free (read); create, meet, update, delete | 2 / 3 |
| `co gdrive` | list, search, info, get (read/download); put (upload), rm | 2 / 3 |
| `co onenote` | ls, pages, read; create | 2 / 3 |
| `co youtube` | channel, list, video (read); update/put (upload) preview first and apply only with `--confirm <code>` | 2 / 3 |
| `co sms` | pair, inbox, devices | 2 / 4 (`pair`) |

## Chat and work trackers

| Group | Subcommands | Tier |
|---|---|---|
| `co slack`, `co discord`, `co telegram`, `co whatsapp`, `co lark`, `co feishu` | Bot/account as an inbox: listen, receive, ls, chats, log, check, consume (read); send, reply, edit, delete, react, done (write). Slack adds channels, history, thread, search. | 2 / 3 |
| `co linear` | issues, issue, search, teams, projects, states, labels, users (read); create, update, comment (write) with a personal API key | 2 / 3 |
| `co canny` | boards, posts, post, search (read); status, comment, changelog create preview unless `--yes` | 2 / 3 |
| `co tiktok` | post (plan, read-only; nothing uploaded), inspect (saves local evidence). Upload not implemented. | 1 / 2 |

## Browser, web, MCP

| Command | Does | Tier |
|---|---|---|
| `co search`, `co fetch` | Web search / page as Markdown. `fetch --prompt` charges credit. | 1–2 |
| `co browser` | One persistent browser (your Chrome by default); `cookies`, `history`, `import` expose or carry logins. Page reads are tier 2; clicks and form fills are writes. | 2 / 3 |
| `co remote-browser` | Browser on another agent's machine. | 4 |
| `co proxy` | Shares this computer's internet connection with an authorized agent. | 4 |
| `co mcp ls/tools/call` | Calls MCP servers already configured in Codex; `ls`/`tools` read-only, `call` runs the tool and acts as that tool's own tier. | 1 / 3 |

## Skills, memory, handoff

| Group | Does | Tier |
|---|---|---|
| `co skills` | discover, copy, manifest, link, index (writes `co:begin` blocks; `index --remove` takes them out) | 1 (`discover`) / 4 |
| `co sub` | `sync <0xaddress>` installs another publisher's skills into `~/.co/subs/` and your coding agents; `list`, `remove` | 4 |
| `co rem` | 55 subcommands. Read: list, show, search, open, status, history, doctor, morning, next. Write/LLM: init, investigate, enrich, muse, deepen, sync, exec, review, merge. Scheduler/consent: start, stop, sources, config, import. Each run reads mail bodies and coding sessions and calls a model (`runner_calls_per_day` caps cost). | 2 / 4 |
| `co handoff` | send, accept, withdraw, ask, answer, thread, inbox, show: hands a coding session to another agent address | 2 / 3 |
| `co claude`, `co ai` | Run Claude Code / an AI coding agent from `co`; `co claude run` executes a prompt in `--cwd` | 3 |

## Agents, deploy, remote

| Command | Does | Tier |
|---|---|---|
| `co host` | Serve the agent in this directory (`./agent.py`) | 3 |
| `co deploy` | Deploy to ConnectOnion Cloud, or `--to` a server you own | 3 |
| `co server add/ls/check/new/ssh/fix-key/forget/destroy` | Register and manage deploy machines; `new` creates (billed), `destroy` deletes the machine, `ssh` opens a shell | 1 (`ls`, `check`) / 3–4 |
| `co call <0xaddress> <cmd…>` | Runs a shell command on a remote agent, limited by its `.co/host.yaml` permission whitelist | 4 |
| `co trust list/level/add/remove/block/unblock/admin` | Who may call your agent; admins can command it | 1 (`list`) / 4 |
| `co schedule list/check/run/pause/resume` | This agent's `.co/schedule.yaml` | 1 / 3 |
| `co approvals` | Record of tool calls, EXEC, Remote Browser, trust changes | 1 |
| `co eval`, `co benchmark`, `co audit` | Run agent evals/benchmarks; `co audit <cli>` scores any CLI's `--help` pages (it executes that CLI's help only) | 1–3 |
| `co copy`, `co asr` | Copy built-in tools/plugins to customize; upload one audio file for transcription | 3 |
