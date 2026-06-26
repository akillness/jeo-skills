---
name: ccpi-marketplace
description: ">"
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: ccpi, claude-code, plugin-marketplace, skills-marketplace, cli, package-management
  platforms: Claude Code, Codex, Gemini CLI, OpenCode
  keyword: ccpi
  version: latest
  source: jeremylongshore/claude-code-plugins-plus-skills
  license: MIT
---



# ccpi-marketplace — Tons of Skills CLI & Plugin Marketplace Operations

Use this skill when the task is operating the **Tons of Skills** ecosystem through CLI commands instead of manual browsing.

## When to use
- Install the `ccpi` CLI and discover plugin packs by keyword.
- Install/update/remove plugin packs in Claude Code environments.
- Verify installed packs and produce reproducible install notes for team handoff.

## Install
```bash
pnpm add -g @intentsolutionsio/ccpi
```

## Core commands
```bash
ccpi search <keyword>
ccpi install <pack-name>
ccpi list --installed
ccpi update
```

Claude built-in marketplace path:
```bash
/plugin marketplace add jeremylongshore/claude-code-plugins
/plugin install <pack>@claude-code-plugins-plus
```

## Safety rules
1. Prefer `ccpi list --installed` before adding/updating packs.
2. Record exact pack names (and versions when available) in change notes.
3. Treat marketplace installs as reversible; keep uninstall/remove path in rollback notes.
4. Do not auto-install large bundles without explicit scope (keyword + target capability).

## Verification checklist
- `ccpi` command resolves and reports version/help.
- search/install/list/update commands run without auth/runtime errors.
- Installed pack appears in `ccpi list --installed` output.

## References
- https://github.com/jeremylongshore/claude-code-plugins-plus-skills
- https://www.npmjs.com/package/@intentsolutionsio/ccpi
- https://tonsofskills.com
