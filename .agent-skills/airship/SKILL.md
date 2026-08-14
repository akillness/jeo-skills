---
name: airship
description: >
  Drive Airship (`@airshiplabs/cli`), a CLI that puts a visual, pannable
  design canvas in front of a running dev server so an engineer can click an
  element, describe a change, and have Claude Code, Codex, or OpenCode edit
  the underlying source file directly — no plugin, no build config, nothing
  added to the project. Use when the user wants to launch a visual editor
  over a local dev server (`npx @airshiplabs/cli --target <port>`), pick or
  compare coding agents (`--agent claude|codex|opencode`) for live UI edits,
  sandbox agent edits with `--safe`, scaffold an `airship.config.json`
  (`airship init`), or diagnose a broken setup (`airship doctor`). Triggers
  on: "airship", "@airshiplabs/cli", "visual editor for my codebase", "click
  to edit UI", "design canvas over dev server", "airship doctor", "airship
  init", "pair Claude Code with a visual editor on localhost".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Node.js >=22.13.0. `npx @airshiplabs/cli` for a one-off run, or `npm i -g
  @airshiplabs/cli` for the persistent `airship` binary. Reuses existing
  auth for Claude Code, Codex, or OpenCode (installed separately) — no
  Airship account, no telemetry. Works with Vite, Next, Remix, Rails, or any
  dev server that serves HTML over HTTP. MIT license.
metadata:
  tags: airship, visual-editor, design-canvas, dev-server, claude-code, codex, opencode, cli, frontend-tooling, ui-editing
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/0xnyn/airship
---

# Airship

Airship is a CLI-only visual editor that runs as a reverse proxy in front of
an already-running dev server (Vite, Next, Remix, Rails, or anything serving
HTML). It renders live device frames on an infinite canvas; selecting an
element and describing a change hands the file/line plus the prompt to
Claude Code, Codex, or OpenCode, which edits the real source file. Nothing
is added to the project's dependencies, config, or bundle, and every edit is
undoable.

## When to use this skill

- Launching the visual editor against a local dev server (`npx
  @airshiplabs/cli --target <port>` or the installed `airship` binary)
- Choosing or comparing coding agents (Claude Code, Codex, OpenCode) for
  interactive, click-to-edit UI changes
- Sandboxing agent edits with `--safe`, or picking `--agent codex --safe`
  for a real OS-level sandbox
- Scaffolding a persistent `airship.config.json` (`airship init`) so flags
  stop needing to be repeated
- Diagnosing a broken install/auth/dev-server setup with `airship doctor`
- Deciding between `canvas` (multi-device frames) and `inline` (overlay on
  one page) editor modes

## When not to use this skill

- The user wants a standalone design tool disconnected from real source
  (Figma-style mockups) — Airship always writes to the actual codebase, not
  a separate design file
- A headless/CI code edit with no visual-selection step → drive the agent
  (Claude Code/Codex/OpenCode) directly instead of routing through Airship
- Browser automation or end-to-end testing → use a browser/testing skill;
  Airship is an editing tool, not a test runner

## Instructions

### Step 1: Start the dev server, then point Airship at it

```bash
pnpm dev                       # e.g. http://localhost:3000
npx @airshiplabs/cli --target 3000
```

No plugin or config changes required. Or install once and reuse the binary:

```bash
npm i -g @airshiplabs/cli
airship --target 3000
```

### Step 2: Or let Airship start (and stop) the dev server itself

```bash
airship --exec "pnpm dev"      # reads the port from package.json when --target is omitted
```

Bare `airship` with no flags asks for the port, agent, and mode
interactively — it needs a terminal.

### Step 3: Pick a coding agent and, if it matters, a sandbox

```bash
airship --target 3000 --agent codex --safe
```

- `claude` (default), `codex`, `opencode` differ on cost display,
  `--effort`/`--max-turns` support, and undo (codex/opencode need the
  project to be a git repo for undo).
- `--safe` is not equally strong on all three: only `codex` gets a real OS
  sandbox; `claude`/`opencode` get a pre-flight command/edit check, not a
  hard wall. See `references/commands.md`.

### Step 4: Check the environment before troubleshooting further

```bash
airship doctor --agent claude
```

Reports `ok`/`warn`/`fail` for node, airship, config, git repo, overlay
bundle, each agent, and the dev server; exits `1` on failure so `airship
doctor && airship` is a safe pre-flight.

### Step 5: Persist settings instead of repeating flags

```bash
airship init            # writes airship.config.json (or an "airship" key in package.json)
```

Resolution order: CLI flags → `AIRSHIP_*` env vars → `airship.config.json`
→ defaults. Every flag has an `AIRSHIP_<FLAG_NAME>` env var (e.g.
`AIRSHIP_TARGET`, `AIRSHIP_AGENT`, `AIRSHIP_SAFE`).

### Step 6: Choose canvas vs inline mode

```bash
airship --target 3000 --mode inline
```

`canvas` (default) shows one live frame per device size on a pannable
canvas; `inline` overlays the editor on the running page itself. Switchable
at runtime from the bottom bar, or per-URL with `?__airship=inline` /
`?__airship=shell`.

## Best practices

1. **`--safe` is only a real sandbox with `--agent codex`** — treat
   `claude`/`opencode` `--safe` as a checked guardrail, not an isolation
   boundary; only the OS-level codex sandbox blocks writes outside the
   project and cuts network access.
2. **Run `airship doctor` before escalating to `--debug`** — most launch
   failures are covered by its ordered checks (node → airship → config →
   git → overlay → agent → dev server).
3. **Require Git before trusting undo on `codex`/`opencode`** — their undo
   reads the previous file version from Git; `claude`'s undo does not need
   a repo.
4. **Set `--cwd` explicitly in monorepos** — it must match the folder the
   dev server treats as its root (e.g. `--cwd apps/web`), or file paths
   reported by the dev server won't resolve to real files.
5. **Quote non-boolean `--codex-config` values** — bare `true`/`false` or
   numeric-looking values are sent as TOML booleans/numbers; quote (`k='"true"'`)
   to keep a string a string.
6. **Prefer `--json` for scripted/automation contexts** — it disables
   colour and the launch banner and keeps stdout machine-readable, while
   banners/warnings/errors still go to stderr.

## References

- [references/commands.md](references/commands.md) — full CLI flag
  reference, exit codes, agent comparison table, safety matrix
- [Airship GitHub Repository](https://github.com/0xnyn/airship)
- [airship.design](https://airship.design)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Point Airship at a running Next.js dev server with Claude Code

```bash
pnpm dev                                   # http://localhost:3000
npx @airshiplabs/cli --target 3000
```

### Example 2: Use Codex with a real sandbox and auto-commit each accepted edit

```bash
airship --exec "pnpm dev" --agent codex --safe --commit
```

### Example 3: Pre-flight check before onboarding a new machine

```bash
airship doctor --agent opencode
```
