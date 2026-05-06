# CLI Automation Reference

## Prerequisites

- Desktop Obsidian installed
- CLI enabled: `Settings → General → Command line interface`
- Installer version 1.12.7+
- Desktop access (not CI/headless servers)

Quick check:
```bash
obsidian help
obsidian version
```

## Vault & File Targeting

Rules:
- `vault=<name>` must come **before** the command when targeting a non-default vault
- Prefer `path=<exact/path.md>` when duplicate note names are possible
- Use `file=<name>` only when wikilink-style resolution is acceptable

```bash
obsidian vault="My Vault" search query="meeting notes"
obsidian vault="My Vault" read path="Projects/Roadmap.md"
obsidian vault=Notes command id=editor:focus-top
```

## Common One-Shot Flows

```bash
obsidian daily
obsidian daily:append content="- [ ] Follow up"
obsidian search query="TODO"
obsidian read path="Inbox/Capture.md"
obsidian create name="Trip to Paris" template=Travel
obsidian tags counts
obsidian tasks daily
obsidian diff file=README from=1 to=3

# Copy output for another tool
obsidian read path="Inbox/Capture.md" --copy
obsidian search query="launch checklist" --copy
```

## Developer Mode

```bash
obsidian devtools
obsidian plugin:reload id=my-plugin
obsidian dev:screenshot path=screenshot.png
obsidian eval code="app.vault.getFiles().length"
obsidian commands
obsidian command id=workspace:open-settings
```

## TUI Mode

```bash
obsidian   # launches interactive TUI with history/autocomplete
```

## URI Handoff (obsidian://)

Official URI actions: `open`, `new`, `daily`, `unique`, `search`, `choose-vault`, `hook-get-address`

```
obsidian://open?vault=my%20vault&file=my%20note
obsidian://new?vault=my%20vault&name=my%20note
obsidian://daily?vault=my%20vault
obsidian://search?vault=my%20vault&query=Obsidian
obsidian://hook-get-address?x-success=myapp://x-callback-url
```

Rules:
- Percent-encode all values
- `path=` overrides `vault` and `file`
- `paneType=window` is desktop-only
- `daily` requires Daily Notes plugin
- `unique` requires Unique Note Creator plugin

## Surface Classification

```yaml
obsidian_automation_intake:
  primary_surface: cli-command | cli-tui | cli-developer | uri-handoff | headless-route-out | filesystem-route-out | plugin-api-route-out
  environment: desktop-local | launcher-shortcut | browser-callback | headless-server
  target_shape: vault-and-note | command-id | uri-action | sync-service | raw-markdown-write
```

## Route-outs

| Scenario | Route to |
|----------|----------|
| Headless Sync/Publish without desktop | Obsidian Headless |
| Write markdown directly to vault | Direct filesystem write |
| Rich external CRUD/frontmatter control | Local REST API or Advanced URI plugin |
| Shell-native notes backend | `nb`, `zk`, or Joplin Terminal |
