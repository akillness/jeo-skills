# Vault and File Targeting

Targeting rules are central to Obsidian CLI automation.

## Default vault behavior

- If the terminal working directory is a vault folder, that vault is used
- Otherwise, the active vault is used

To force a vault:

```bash
obsidian vault=Notes daily
obsidian vault="My Vault" search query="test"
```

`vault=<name>` or `vault=<id>` must be the first parameter before the command.

In the TUI, switch vaults with:

```bash
vault:open <name-or-id>
```

## File targeting

Many commands accept `file=` and `path=`.

### `file=<name>`

- resolves the note like a wikilink
- matches by note name
- does not require the full path
- does not require `.md` if the target is a markdown file

Example:

```bash
obsidian read file=Recipe
```

### `path=<path>`

- requires the exact path from the vault root
- is better when duplicate file names exist

Example:

```bash
obsidian read path="Templates/Recipe.md"
```

## `--copy`

Add `--copy` to copy command output to the clipboard.

Examples:

```bash
obsidian read --copy
obsidian search query="TODO" --copy
```

## `paneType`

Some commands accept:

- `paneType=tab`
- `paneType=split`
- `paneType=window`

`window` is desktop-only and opens in a pop-out window.
