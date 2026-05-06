---
name: obsidian-cli
description: >
  ALIAS — merged into the unified `obsidian` skill (v2.0). Use the `obsidian` skill instead.
  Route Obsidian desktop automation: official CLI, obsidian:// URIs, developer commands.
  Redirects to obsidian skill for vault targeting, daily-note flows, plugin reload, URI handoff.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Requires desktop Obsidian with CLI enabled (Settings → General → Command line interface,
  installer 1.12.7+). Merged into obsidian skill v2.0.
license: Proprietary docs, skill authored for oh-my-skills
metadata:
  tags: obsidian, cli, terminal, automation, vault, uri, developer-tools, notes, tui
  version: "2.1.0"
  source: https://obsidian.md/help/cli
  deprecated: "Merged into obsidian skill v2.0 — use obsidian instead"
---

# obsidian-cli - Route Obsidian desktop automation correctly

Use this skill when the request is really about **driving desktop Obsidian from the terminal or a URI handoff**, not generic note taking.

`obsidian-cli` owns official CLI enablement, one-shot/TUI usage, deterministic `vault=` / `file=` / `path=` targeting, developer-command execution, official `obsidian://` handoff, and honest route-outs when the job is really headless sync, raw filesystem writing, or richer plugin/API automation.

Read these support docs before unusual cases or when the request starts to sprawl:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/installation-and-troubleshooting.md](references/installation-and-troubleshooting.md)
- [references/vault-and-file-targeting.md](references/vault-and-file-targeting.md)
- [references/commands-and-developer-tools.md](references/commands-and-developer-tools.md)
- [references/uri-and-callbacks.md](references/uri-and-callbacks.md)

## When to use this skill
- The user wants to enable or verify the **official Obsidian CLI**.
- The job is to run `obsidian` one-shot commands or use the TUI against a running desktop app.
- The workflow needs explicit vault or note targeting via `vault=`, `file=`, or `path=`.
- The user wants daily-note, search, read, create, tags, tasks, diff, or command-palette workflows from the shell.
- The user is developing an Obsidian plugin/theme and needs `plugin:reload`, `devtools`, `dev:screenshot`, `eval`, or `command id=...`.
- Another app, launcher, shortcut, browser, or agent loop needs **official `obsidian://` URI** handoff or callback behavior.

## When not to use this skill
- **The main job is headless Sync/Publish without the desktop app** → route to Obsidian Headless, not this skill.
- **The main job is generic markdown file editing in a vault path** → direct filesystem writes may be simpler and more truthful.
- **The main job needs richer external CRUD/frontmatter/workspace automation than first-party CLI/URI cover** → use a plugin/API route such as Local REST API or Advanced URI instead of pretending the official CLI is enough.
- **The user wants a shell-native notes backend independent of Obsidian** → an adjacent note CLI such as Joplin Terminal, `nb`, or `zk` is a better fit.

## Instructions

### Step 1: Classify the primary automation surface
Normalize the request before reaching for commands.

```yaml
obsidian_automation_intake:
  primary_surface: cli-command | cli-tui | cli-developer | uri-handoff | headless-route-out | filesystem-route-out | plugin-api-route-out
  environment: desktop-local | launcher-shortcut | browser-callback | headless-server | unknown
  target_shape: vault-and-note | command-id | uri-action | sync-service | raw-markdown-write
  plugin_dependencies: none | daily-notes | unique-note-creator | plugin-command | unknown
```

Use one primary surface per run:
- `cli-command` — one-shot terminal command against the running app
- `cli-tui` — interactive `obsidian` shell with history/autocomplete
- `cli-developer` — plugin/theme/dev commands or command-palette execution
- `uri-handoff` — `obsidian://` open/new/daily/search/hook callbacks from another app
- `headless-route-out` — Sync/Publish without the desktop app
- `filesystem-route-out` — direct markdown writes are more honest than app control
- `plugin-api-route-out` — first-party CLI/URI are too narrow for the requested automation

Do not mix several primary surfaces into one answer.

### Step 2: Verify the desktop runtime before using the CLI
Use [references/installation-and-troubleshooting.md](references/installation-and-troubleshooting.md).

Minimum checks:
- desktop Obsidian is installed
- CLI is enabled in `Settings -> General -> Command line interface`
- official docs currently require installer version `1.12.7+`
- the machine actually has desktop access; do not force this onto CI or headless servers

Quick local check:

```bash
bash scripts/install.sh
```

If the desktop app is absent or the task is explicitly no-GUI, switch immediately to `headless-route-out` or `filesystem-route-out`.

### Step 3: Make targeting deterministic
Use [references/vault-and-file-targeting.md](references/vault-and-file-targeting.md).

Rules:
- `vault=<name>` or `vault=<id>` must come **before** the command when targeting a non-default vault
- prefer `path=<exact/path.md>` when duplicate note names are possible
- use `file=<name>` only when wikilink-style resolution is acceptable
- avoid relying on active vault / active file unless the task is explicitly interactive

Examples:

```bash
obsidian vault="My Vault" search query="meeting notes"
obsidian vault="My Vault" read path="Projects/Roadmap.md"
obsidian vault=Notes command id=editor:focus-top
```

### Step 4: Choose the smallest truthful packet
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Default selection:
- **CLI command packet** for read/search/create/tasks/daily work where terminal output matters
- **TUI packet** for interactive exploration and history
- **Developer packet** for plugin reload, screenshots, `eval`, or command-palette execution
- **URI packet** for launchers, shortcuts, browser callbacks, and app handoff
- **Route-out packet** for headless sync, raw file writes, or plugin/API-level automation

### Step 5: Use official CLI flows when the app itself is the runtime
Use [references/commands-and-developer-tools.md](references/commands-and-developer-tools.md).

Safe first commands:

```bash
obsidian help
obsidian version
```

Common one-shot flows:

```bash
obsidian daily
obsidian daily:append content="- [ ] Follow up"
obsidian search query="TODO"
obsidian read path="Inbox/Capture.md"
obsidian create name="Trip to Paris" template=Travel
obsidian tags counts
obsidian tasks daily
obsidian diff file=README from=1 to=3
```

Use `--copy` when another tool needs the result:

```bash
obsidian read path="Inbox/Capture.md" --copy
obsidian search query="launch checklist" --copy
```

### Step 6: Treat developer commands as a separate mode
Developer commands are real supported use cases, but they are stateful.

```bash
obsidian devtools
obsidian plugin:reload id=my-plugin
obsidian dev:screenshot path=screenshot.png
obsidian eval code="app.vault.getFiles().length"
obsidian commands
obsidian command id=workspace:open-settings
```

Use this mode when the job is plugin/theme work, command discovery, or app-state inspection.

### Step 7: Use official URI flows for handoff and callbacks
Use [references/uri-and-callbacks.md](references/uri-and-callbacks.md).

Keep these official URI actions at the front door: `open`, `new`, `daily`, `unique`, `search`, `choose-vault`, `hook-get-address`.

Examples:

```text
obsidian://open?vault=my%20vault&file=my%20note
obsidian://new?vault=my%20vault&name=my%20note
obsidian://daily?vault=my%20vault
obsidian://search?vault=my%20vault&query=Obsidian
obsidian://hook-get-address?x-success=myapp://x-callback-url
```

Rules:
- percent-encode values correctly
- `path=` overrides `vault` and `file`
- `paneType=window` is desktop-only
- `daily` requires the Daily notes plugin
- `unique` requires the Unique note creator plugin
- callback support is endpoint-specific; prefer it when another app must continue after Obsidian responds

Helper:

```bash
bash scripts/open-uri.sh 'obsidian://open?vault=my%20vault&file=my%20note'
```

### Step 8: Route away when the request changed
Say the route-out explicitly:
- **Headless Sync/Publish without desktop app** → Obsidian Headless
- **Write markdown to a vault on disk and stop** → direct filesystem write
- **Need richer external CRUD/frontmatter/workspace control** → plugin/API workflow such as Local REST API or Advanced URI
- **Need a shell-native note system, not Obsidian** → Joplin Terminal, `nb`, or `zk`

The skill gets better by refusing the wrong jobs quickly, not by pretending every note workflow belongs here.

## Output format

Use one compact packet:
- **Primary surface** — CLI command, TUI, developer mode, URI handoff, or route-out
- **Runtime checks** — desktop requirement, CLI enabled state, plugin prerequisites
- **Targeting** — vault and note target, with determinism notes when needed
- **Recommended command or URI** — the smallest truthful command/URI for the job
- **Important constraints** — encoding, plugin dependency, desktop-only behavior, or statefulness
- **If this is actually a different job** — explicit route-out and why

## Examples

### Example 1: Verify official CLI registration
**Input**: Obsidian CLI를 처음 쓰려는데 어떻게 켜고 확인해야 해?
- use `bash scripts/install.sh`
- mention `Settings -> General -> Command line interface`
- keep the answer on official desktop CLI

### Example 2: Deterministic vault/path targeting
**Input**: 특정 vault에서 검색하고 특정 노트를 읽고 싶어. file이랑 path는 뭐가 달라?
- explain `vault=` must precede the command
- contrast wikilink-style `file=` vs exact `path=`
- prefer exact `path=` when ambiguity matters

### Example 3: Developer loop
**Input**: 내가 개발 중인 Obsidian 플러그인을 CLI로 리로드하고 스크린샷도 찍고 싶어.
- switch to developer mode
- mention `plugin:reload` and `dev:screenshot`

### Example 4: URI callback workflow
**Input**: 외부 앱에서 obsidian:// 링크로 노트 열고 새 노트 만들고 싶은데 callback도 가능해?
- use official `obsidian://open` / `obsidian://new`
- explain encoding and `x-success` / `x-error`

### Example 5: No-desktop sync request
**Input**: 데스크톱 앱 없이 CLI만으로 sync하고 싶어.
- explicitly route out to Obsidian Headless
- state that Obsidian CLI controls the desktop app and is not the right tool here

## Best practices
1. Start by classifying **CLI command vs URI handoff vs route-out**, not by listing every command family.
2. Prefer exact `vault=` + `path=` for agent-safe deterministic targeting.
3. Use `commands` / `command id=...` when the real behavior comes from a plugin command.
4. Use `--copy` or structured output formats when another tool needs the result.
5. Treat `plugin:reload`, `eval`, `dev:screenshot`, and `devtools` as privileged developer operations.
6. Keep URI answers strict about encoding, plugin prerequisites, and desktop-only callback details.
7. Do not send headless/server jobs through this skill just because the phrase “Obsidian CLI” appeared.
8. Re-check installation guidance against current official docs when OS-specific registration behavior changes.

## References
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/installation-and-troubleshooting.md](references/installation-and-troubleshooting.md)
- [references/vault-and-file-targeting.md](references/vault-and-file-targeting.md)
- [references/commands-and-developer-tools.md](references/commands-and-developer-tools.md)
- [references/uri-and-callbacks.md](references/uri-and-callbacks.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/run-command.sh](scripts/run-command.sh)
- [scripts/open-uri.sh](scripts/open-uri.sh)
- [Obsidian CLI](https://obsidian.md/help/cli)
- [Obsidian URI](https://obsidian.md/help/uri)
- [Obsidian Headless](https://obsidian.md/help/Extending%20Obsidian/Obsidian%20Headless)
