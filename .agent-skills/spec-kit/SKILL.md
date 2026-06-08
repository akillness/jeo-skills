---
name: spec-kit
description: >
  Run GitHub's Spec-Driven Development (SDD) workflow via the `specify` CLI —
  install spec-kit, initialize a project for one of 30+ AI coding agents
  (Claude Code, Copilot, Gemini, Cursor, Codex, Qwen, opencode, Kiro, etc.),
  and drive the constitution → specify → plan → tasks → implement command
  pipeline. Use when the user wants to bootstrap a Spec-Driven Development
  project, install `specify-cli`, generate executable specs before code, or
  invoke the `/speckit.*` slash commands (`/speckit.constitution`,
  `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`,
  `/speckit.clarify`, `/speckit.analyze`, `/speckit.checklist`). Triggers on:
  spec-kit, speckit, specify, specify init, spec-driven, spec driven
  development, SDD, /speckit, executable spec.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Cross-platform spec-first workflow installer and router for Claude Code,
  GitHub Copilot, Gemini CLI, Codex CLI, Cursor CLI, opencode, Qwen, Kiro,
  and 20+ additional integrations supported by `specify`. Routes broader
  spec-first orchestration to `ooo`, planning-packet routing to `bmad`, and
  artifact approval to `plannotator`.
metadata:
  tags: spec-kit, speckit, specify, sdd, spec-driven-development, planning, github, plugin, multi-agent
  platforms: Claude, Copilot, Gemini, Codex, Cursor, OpenCode, Qwen, Kiro, All
  keyword: spec-kit
  version: "1.0.0"
  upstream: https://github.com/github/spec-kit
  installer: uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
  source: akillness/oh-my-skills
---

# spec-kit — Spec-Driven Development via `specify`

GitHub's [spec-kit](https://github.com/github/spec-kit) inverts the usual flow:
**specifications become executable** and directly drive implementation. This
skill is the routing-first wrapper around the upstream `specify` CLI — it
installs the tool, bootstraps a project for a chosen AI agent, and walks the
five-step SDD command pipeline.

## When to use this skill

- The user asks to install `spec-kit`, `specify-cli`, or "GitHub spec kit"
- The user wants to start a project with a Spec-Driven Development workflow
- The user types or asks about `/speckit.constitution`, `/speckit.specify`,
  `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`, `/speckit.clarify`,
  `/speckit.analyze`, or `/speckit.checklist`
- The user wants to share an executable spec across Claude Code, Copilot,
  Gemini, Cursor, Codex, opencode, Qwen, Kiro, or another supported agent
- The user wants to discover community spec-kit extensions or presets
  (`specify extension search`, `specify preset search`)

## When not to use this skill

- The user wants a **vendor-neutral packet-first planning router** that
  classifies the next BMAD artifact → use `bmad`
- The user needs a **spec-first control loop with immutable seed and
  drift-aware execution** independent of GitHub spec-kit → use `ooo`
- The user wants **visual review/approval of an existing plan or diff** →
  use `plannotator`
- The user wants **pre-planning concept framing** (problem, audience,
  positioning) before any spec exists → use `bmad-idea`

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Linux / macOS / Windows | Native or WSL on Windows |
| Python 3.11+ | Required by `specify-cli` |
| `uv` (recommended) or `pipx` | Tool installation manager |
| `git` | Repo + plugin marketplace operations |
| One supported AI agent | Claude Code, Copilot, Gemini, Codex, etc. |

## Instructions

### Step 1 — Install `specify-cli`

```bash
# Recommended: uv tool install (pins via Git ref)
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Pinned to a tag (reproducibility):
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.0.10

# Alternative: pipx
pipx install git+https://github.com/github/spec-kit.git

# Verify
specify --version
specify integration list
```

### Step 2 — Pick the target AI agent

`specify integration list` prints all supported agents. Common options:

| Agent | `--integration` value |
|-------|------------------------|
| Claude Code | `claude` |
| GitHub Copilot | `copilot` |
| Google Gemini CLI | `gemini` |
| OpenAI Codex CLI | `codex` |
| Cursor CLI | `cursor` |
| opencode | `opencode` |
| Qwen CLI | `qwen` |
| Kiro CLI | `kiro` |

### Step 3 — Initialize the project

```bash
# Create a new project directory and bootstrap it
specify init my-project --integration claude

# Bootstrap in the current directory
specify init . --integration copilot

# Force-overwrite into the current directory
specify init --here --force --integration gemini
```

This writes `.specify/`, agent-specific command files, and the constitution
template.

### Step 4 — Drive the SDD command pipeline

Run these slash commands **inside the chosen agent** (Claude Code, Copilot,
Gemini, etc.). The agent reads files written by `specify init`.

| Command | Purpose |
|---------|---------|
| `/speckit.constitution` | Establish project principles, non-negotiables |
| `/speckit.specify` | Capture requirements and user stories |
| `/speckit.plan` | Produce the technical implementation strategy |
| `/speckit.tasks` | Break the plan into actionable tasks |
| `/speckit.implement` | Execute the plan task by task |

Optional refinements:

- `/speckit.clarify` — interview to resolve ambiguity in the spec
- `/speckit.analyze` — review consistency between constitution, spec, plan
- `/speckit.checklist` — generate quality checklists for review gates

### Step 5 — Extensions and presets (community)

```bash
specify extension search
specify extension add <extension-name>

specify preset search
specify preset add <preset-name>
```

Browse community resources at <https://github.github.io/spec-kit/community/>.

### Step 6 — Plugin-style installation alongside oh-my-skills

This skill folder is plugin-installable through the standard oh-my-skills
flow so the wrapper, references, and installer script land on disk for any
supported agent runtime:

```bash
# Project install (writes into .agents/skills/spec-kit/)
npx skills add https://github.com/akillness/oh-my-skills --skill spec-kit

# Global install for every detected agent
npx skills add -g https://github.com/akillness/oh-my-skills --skill spec-kit

# Target specific agents
npx skills add -g https://github.com/akillness/oh-my-skills --skill spec-kit -a claude-code -a codex -y
```

The skill also ships [`scripts/install.sh`](scripts/install.sh) as a
one-shot installer that detects `uv` / `pipx` and runs Step 1.

## Output format

When the user asks `spec-kit` for help, return a compact brief:

```markdown
# spec-kit Routing Brief

## Scope
- Target agent: claude | copilot | gemini | codex | cursor | opencode | ...
- Project state: new | existing-init | mid-pipeline | extension-only
- Pipeline stage: constitution | specify | plan | tasks | implement | clarify | analyze | checklist

## Recommended next move
- install-specify | specify-init | run-/speckit.<command> | add-extension

## Why
- 2-3 bullets grounded in the user's packet

## Route-outs
- `ooo` for vendor-neutral spec-first loops
- `bmad` for packet-first BMAD/BMM artifact selection
- `plannotator` for approval/review of an existing plan
```

## Best practices

1. **Pin a Git ref** (`@v0.0.10` or a commit SHA) when reproducibility is
   important — `main` moves.
2. **One integration per repo** unless the user explicitly wants multi-agent
   parity; switching `--integration` rewrites command files.
3. **Treat `/speckit.constitution` as load-bearing** — downstream
   `/speckit.plan` and `/speckit.tasks` honor it, so update it first when
   principles drift.
4. **Use `/speckit.clarify` before `/speckit.plan`** when the spec is
   ambiguous instead of letting the plan paper over open questions.
5. **Hand off the artifact to `plannotator`** for explicit review before
   `/speckit.implement` on level 2+ work.
6. **Route to `ooo`** when the user actually wants a vendor-neutral
   spec-first loop with drift tracking instead of GitHub's pipeline.

## References

- Upstream repo: <https://github.com/github/spec-kit>
- Documentation site: <https://github.github.io/spec-kit/>
- Community presets and extensions: <https://github.github.io/spec-kit/community/>
- Installer script: [`scripts/install.sh`](scripts/install.sh)
- Command reference: [`references/commands.md`](references/commands.md)
- Adjacent skills: `../ooo/SKILL.md`, `../bmad/SKILL.md`,
  `../plannotator/SKILL.md`, `../bmad-idea/SKILL.md`
- License: MIT (see upstream `LICENSE`)
