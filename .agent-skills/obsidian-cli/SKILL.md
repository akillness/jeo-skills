---
name: obsidian-cli
description: >
  Install, enable, and operate Obsidian CLI for terminal-driven note automation against a
  running Obsidian app. Use when you need to run Obsidian commands from a shell or TUI,
  target a specific vault or file, automate daily notes, search, tags, tasks, or file
  operations, use developer commands such as plugin reload and screenshots, or launch
  `obsidian://` URIs with callback parameters. Triggers on: obsidian cli, obsidian command
  line, obsidian uri, obsidian daily note command, obsidian plugin reload cli, obsidian
  dev screenshot, obsidian vault command.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires the desktop Obsidian app with Command line interface enabled from Settings -> General. Official docs state CLI support requires the Obsidian 1.12 installer and a current early access build; the app must be running or will be launched by the first CLI command.
license: Proprietary docs, skill authored for oh-my-skills
metadata:
  tags: obsidian, cli, terminal, automation, vault, uri, developer-tools, notes, tui
  version: "1.0"
  source: https://obsidian.md/help/cli
---

# obsidian-cli - Control Obsidian from the Terminal

> **Keyword**: `obsidian cli` · `obsidian uri` · `obsidian daily note command` · `obsidian plugin reload cli`
>
> Use this skill for the official desktop CLI. If the user needs sync without the desktop app, that is Obsidian Headless, not this skill.

Obsidian CLI is the official command line interface for controlling a running Obsidian app from the terminal. It supports single commands, an interactive TUI, vault and file targeting, note operations, search, tags, tasks, and developer commands. Official docs also link it closely with the `obsidian://` URI protocol for cross-app automation.

## When to use this skill

- Enable and verify the official Obsidian CLI registration
- Run one-shot commands such as `obsidian help`, `obsidian daily`, `obsidian read`, or `obsidian search`
- Open the interactive TUI with autocomplete and history
- Target a specific vault with `vault=<name>` or `vault=<id>`
- Target a specific note with `file=<name>` or `path=<path>`
- Copy command output with `--copy`
- Use developer commands for plugin and theme work such as `devtools`, `plugin:reload`, `dev:screenshot`, and `eval`
- Launch or generate `obsidian://` URIs for open, new, daily, unique, search, and callback-based workflows

## Instructions

### Step 1: Enable and verify the CLI

Use the official app flow first:

1. Upgrade to the installer and early access versions required by the docs
2. In Obsidian, go to `Settings -> General`
3. Enable `Command line interface`
4. Follow the prompt to register the CLI

Run the local helper:

```bash
bash scripts/install.sh
```

What to remember:

- The docs currently say CLI usage requires the Obsidian `1.12` installer
- The same page also says to upgrade to the latest installer `1.11.7` and the latest early access `1.12.x`
- The app must be running, or the first CLI command launches it
- Linux packaging may need extra symlink or PATH work

Treat those version strings exactly as current official docs, not as inferred packaging logic.

### Step 2: Choose single-command mode or the TUI

Run a single command:

```bash
obsidian help
```

Open the terminal interface:

```bash
obsidian
help
```

Use the TUI when the user wants autocomplete, command history, and reverse search. Use single-command mode for scripts, automation, and shell aliases.

### Step 3: Target the right vault and file

Vault targeting rules:

- If the current working directory is a vault, that vault is used by default
- Otherwise, the active vault is used
- `vault=<name>` or `vault=<id>` must be the first parameter before the command

Examples:

```bash
obsidian vault=Notes daily
obsidian vault="My Vault" search query="meeting notes"
```

File targeting rules:

- `file=<name>` uses wikilink-style resolution by file name
- `path=<path>` requires the exact path from the vault root
- If neither is provided, many commands default to the active file

Examples:

```bash
obsidian read file=Recipe
obsidian read path="Templates/Recipe.md"
```

Move the targeting details into [references/vault-and-file-targeting.md](references/vault-and-file-targeting.md).

### Step 4: Use the command families that match the job

Start with the everyday commands:

- `daily`
- `daily:append`
- `search`
- `read`
- `create`
- `tags`
- `tasks`
- `diff`

General commands:

- `help`
- `version`
- `reload`
- `restart`

Developer-oriented commands:

- `devtools`
- `plugin:reload`
- `dev:screenshot`
- `eval`

These developer commands are especially useful for plugin and theme workflows because the docs explicitly position them for automatic testing and debugging.

See [references/commands-and-developer-tools.md](references/commands-and-developer-tools.md) for a compact command map.

### Step 5: Use flags and output features deliberately

Parameter rules:

- Parameters use `name=value`
- Wrap values with spaces in quotes
- Boolean switches are bare flags such as `open` or `overwrite`
- Use `\n` for newlines and `\t` for tabs in content strings

Examples:

```bash
obsidian create
obsidian create name=Note content="Hello world"
obsidian create name=Note content="Hello" open overwrite
obsidian create name=Note content="# Title\n\nBody text"
```

Output helper:

```bash
obsidian read --copy
obsidian search query="TODO" --copy
```

Many listing commands also expose `format=` parameters such as `json`, `tsv`, `csv`, `md`, or `paths`.

### Step 6: Use `obsidian://` URI workflows for external automation

The official URI actions include:

- `open`
- `new`
- `daily`
- `unique`
- `search`
- `choose-vault`

Examples:

```text
obsidian://open?vault=my%20vault&file=my%20note
obsidian://new?vault=my%20vault&name=my%20note
obsidian://daily?vault=my%20vault
obsidian://search?vault=my%20vault&query=Obsidian
```

Important URI rules:

- Encode values properly, especially spaces and `/`
- `path=` overrides `vault` and `file`
- `paneType=tab|split|window` controls opening location
- `paneType=window` is desktop-only
- `x-success` and `x-error` support callback flows on supported endpoints

Use [references/uri-and-callbacks.md](references/uri-and-callbacks.md) for the URI-specific behavior and Hook integration notes.

### Step 7: Respect the limitations

- CLI automation is for the desktop app, not headless sync
- `daily` requires the Daily notes plugin to be enabled
- `unique` requires the Unique note creator plugin to be enabled
- Linux registration may require manual symlinks, PATH updates, or packaging-specific fixes
- Developer commands can change app or plugin state, so use them intentionally

## Examples

### Example 1: Verify CLI registration

```bash
bash scripts/install.sh
```

### Example 2: Open the TUI

```bash
bash scripts/run-command.sh
```

### Example 3: Open today's daily note

```bash
bash scripts/run-command.sh daily
```

### Example 4: Append a task to today's daily note

```bash
bash scripts/run-command.sh daily:append content="- [ ] Buy groceries"
```

### Example 5: Search a specific vault

```bash
bash scripts/run-command.sh vault="My Vault" search query="meeting notes"
```

### Example 6: Read a file by name or exact path

```bash
bash scripts/run-command.sh read file=Recipe
bash scripts/run-command.sh read path="Templates/Recipe.md" --copy
```

### Example 7: Reload a plugin you are developing

```bash
bash scripts/run-command.sh plugin:reload id=my-plugin
```

### Example 8: Take a screenshot from the app

```bash
bash scripts/run-command.sh dev:screenshot path=screenshot.png
```

### Example 9: Open a note via URI

```bash
bash scripts/open-uri.sh 'obsidian://open?vault=my%20vault&file=my%20note'
```

## Best practices

1. Start with `obsidian help` or the TUI before assuming a command family name.
2. Put `vault=` first when you need deterministic multi-vault automation.
3. Prefer `path=` when duplicate file names make wikilink-style `file=` resolution ambiguous.
4. Use `--copy` when the result needs to feed another tool or model without extra shell parsing.
5. Treat developer commands like `plugin:reload`, `eval`, and `dev:screenshot` as operational tools, not casual shortcuts.
6. Keep CLI automation separate from Headless Sync workflows; they solve different problems.
7. URI values must be encoded correctly or the action may be misinterpreted.
8. On Linux, check registration, symlinks, and `PATH` before assuming the CLI is broken.

## References

- [references/installation-and-troubleshooting.md](references/installation-and-troubleshooting.md)
- [references/vault-and-file-targeting.md](references/vault-and-file-targeting.md)
- [references/commands-and-developer-tools.md](references/commands-and-developer-tools.md)
- [references/uri-and-callbacks.md](references/uri-and-callbacks.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/run-command.sh](scripts/run-command.sh)
- [scripts/open-uri.sh](scripts/open-uri.sh)
- [Obsidian CLI](https://obsidian.md/help/cli)
- [Obsidian URI](https://obsidian.md/help/uri)
