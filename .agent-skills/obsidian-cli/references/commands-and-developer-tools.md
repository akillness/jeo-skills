# Commands and Developer Tools

The CLI page exposes a large command surface. For a practical skill, group it by user jobs instead of reproducing the full manual.

## General commands

- `help`
- `version`
- `reload`
- `restart`

These are the safest first commands for discovery and validation.

## Everyday commands

Common examples shown directly in the docs:

```bash
obsidian daily
obsidian daily:append content="- [ ] Buy groceries"
obsidian search query="meeting notes"
obsidian read
obsidian tasks daily
obsidian create name="Trip to Paris" template=Travel
obsidian tags counts
obsidian diff file=README from=1 to=3
```

## Command families the docs expose

Representative groups visible on the CLI page:

- Bases
- Bookmarks
- Command palette and hotkeys
- Daily notes
- File history
- Files and folders
- Links
- Outline
- Plugins
- Properties
- Publish
- Search
- Sync
- Tags
- Tasks
- Templates
- Themes and snippets
- Vault
- Workspace
- Windows

When a user asks for a specific domain, start with `obsidian help` or the relevant family command instead of guessing parameters.

## Developer commands

The docs explicitly call out developer commands for plugin and theme work:

```bash
obsidian devtools
obsidian plugin:reload id=my-plugin
obsidian dev:screenshot path=screenshot.png
obsidian eval code="app.vault.getFiles().length"
```

Use cases:

- open the Chromium developer tools
- reload a community plugin under development
- capture screenshots from the app
- inspect application state with inline JavaScript

These commands are powerful. They can change application state or touch active development sessions, so use them intentionally.

## Output formats

Many list-style commands accept `format=` with values such as:

- `json`
- `tsv`
- `csv`
- `md`
- `paths`

Prefer structured formats when piping output into other tools.
