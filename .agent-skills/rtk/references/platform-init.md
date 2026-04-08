# RTK Platform Init Matrix

Use this file when the user needs the exact `rtk init` command, scope, or integration type for a specific agent.

## Agent matrix

| Agent | Command | Scope | Integration type |
|------|---------|-------|------------------|
| Claude Code | `rtk init -g` | Global recommended | PreToolUse shell hook |
| Claude Code | `rtk init` | Local optional | Project instructions only |
| Codex | `rtk init --codex` | Local | `AGENTS.md` + `RTK.md` guidance |
| Codex | `rtk init -g --codex` | Global | `~/.codex/AGENTS.md` + `~/.codex/RTK.md` |
| Gemini CLI | `rtk init -g --gemini` | Global only | Gemini hook |
| Cursor | `rtk init -g --agent cursor` | Global only | `hooks.json` shell hook |
| GitHub Copilot | `rtk init -g --copilot` | Global only | Copilot hook or deny-with-suggestion |
| Windsurf | `rtk init --agent windsurf` | Local only | `.windsurfrules` |
| Cline / Roo Code | `rtk init --agent cline` | Local only | `.clinerules` |
| OpenCode | `rtk init -g --opencode` | Global only | TypeScript plugin |

## Useful variants

### Claude Code

```bash
rtk init -g
rtk init -g --auto-patch
rtk init -g --no-patch
rtk init -g --hook-only
rtk init -g --uninstall
rtk init --show
```

### Codex

```bash
rtk init --codex
rtk init -g --codex
rtk init -g --codex --uninstall
```

Codex is prompt-guided, not a transparent shell-hook rewrite path. Direct `rtk` commands still matter.

### Gemini CLI

```bash
rtk init -g --gemini
rtk init -g --gemini --uninstall
```

### Cursor

```bash
rtk init -g --agent cursor
```

### Windsurf / Cline

```bash
rtk init --agent windsurf
rtk init --agent cline
```

These are project-local rules files and should not be treated as global hook installs.

### OpenCode

```bash
rtk init -g --opencode
```

This installs the OpenCode plugin to `~/.config/opencode/plugins/rtk.ts`.

## After any init

Run:

```bash
rtk init --show
```

Use this to confirm that the relevant hook, prompt file, or plugin is present.
