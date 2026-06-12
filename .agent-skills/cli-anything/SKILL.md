---
name: cli-anything
description: >
  Make any software agent-native with HKUDS CLI-Anything — route between
  four modes: install ready-made CLI harnesses via the CLI-Hub package
  manager (`pip install cli-anything-hub`, then `cli-hub
  list/search/info/install/launch`), give agents the autonomous discovery
  meta-skill (`npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill`),
  generate a new harness from any codebase or GitHub repo via the 7-phase
  pipeline (`/plugin install cli-anything` → `/cli-anything <path>`), or
  iterate with `/cli-anything:refine`, `:test`, `:validate`. 40+ production
  harnesses (GIMP, Blender, LibreOffice, OBS, ComfyUI, Ollama, Godot,
  QGIS, …), 2,461 passing tests, Click CLIs with REPL + `--json` output.
  Use when agents must drive real desktop/server software without GUI
  automation. Triggers on: cli-anything, cli-hub, cli-anything-hub,
  agent-native cli, make software agent-native, cli harness generation,
  /cli-anything, harness refine, HKUDS cli.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Cross-platform wrapper for the CLI-Anything ecosystem usable from Claude
  Code (marketplace plugin), Codex (bundled skill installer), OpenCode
  (commands), OpenClaw, Pi, Hermes, Qodercli, GitHub Copilot CLI, and Goose.
  Routes agent-team architecture to `harness`, Claude plugin marketplace
  browsing to `ccpi-marketplace`, and no-codebase GUI/browser automation to
  `browser-harness`.
metadata:
  tags: cli-anything, cli-hub, agent-native, computer-use, cli-generation, harness, click, repl, json-output, hkuds, plugin
  platforms: Claude, Codex, OpenCode, OpenClaw, Pi, Hermes, Copilot, All
  keyword: cli-anything
  version: "1.0.0"
  upstream: https://github.com/HKUDS/CLI-Anything
  installer: pip install cli-anything-hub
  source: akillness/oh-my-skills
---

# cli-anything — Make Any Software Agent-Native

[CLI-Anything](https://github.com/HKUDS/CLI-Anything) (HKUDS) bridges AI
agents and the world's software: instead of brittle GUI automation, it wraps
real applications (Blender, GIMP, LibreOffice, OBS, Godot, QGIS, …) in
structured, agent-first CLIs — Click commands, stateful REPL, `--json`
output, undo/redo — generated and validated through a 7-phase pipeline with
2,461 passing tests across 40+ harnesses. This skill is the routing-first
wrapper: pick the right mode, install the right surface, and drive the
build → refine → validate loop.

## When to use this skill

- The user wants an agent to control real software (image/video/audio
  editing, office, 3D, GIS, game engines, diagramming, streaming) through a
  CLI instead of screenshots or RPA
- The user asks to install `cli-anything-hub` / use `cli-hub`
  (`list`, `search`, `info`, `install`, `update`, `uninstall`, `launch`)
- The user wants agents to **autonomously discover and install** CLIs via
  the CLI-Hub meta-skill
- The user wants to **generate a new CLI harness** from a local codebase or
  GitHub repo with `/cli-anything`, or asked how to install the
  CLI-Anything plugin/skill for Claude Code, Codex, OpenCode, OpenClaw, Pi,
  Hermes, Qodercli, or GitHub Copilot CLI
- The user wants to expand or verify an existing harness with
  `/cli-anything:refine`, `/cli-anything:test`, or `/cli-anything:validate`

## When not to use this skill

- The user wants to **design a domain-specific agent team** (agents +
  skills scaffolding), not a software CLI wrapper → use `harness`
- The user is browsing/installing **Claude plugins generally** → use
  `ccpi-marketplace`
- The target has **no codebase and no API** and must be driven through a
  real browser/GUI session → use `browser-harness` (or `playwriter` for an
  already-open browser)
- The user only needs **web scraping/extraction** → use `scrapling`

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Python 3.10+ | CLI-Hub and generated harnesses are Python/Click based |
| Target software | Harnesses call the real backend — install the upstream app (GIMP, Blender, …) too |
| A frontier coding agent | Harness *generation* needs strong models (Claude Opus/Sonnet class); weaker models degrade quality |
| Source code access | The 7-phase generator works from source; binary-only targets degrade substantially |

## Instructions

### Step 1 — Choose the mode

| Mode | When | Entry point |
|------|------|-------------|
| **Use the ecosystem** | A ready-made harness likely exists | `pip install cli-anything-hub` → `cli-hub search <kw>` |
| **Empower agents** | Agents should pick/install CLIs themselves | `npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill -g -y` |
| **Generate a harness** | Registry doesn't cover the software | Platform plugin/skill → `/cli-anything <path-or-repo>` |
| **Iterate a harness** | Coverage gaps, failing flows | `/cli-anything:refine` · `:test` · `:validate` |

Prefer the registry first — building is the fallback, not the default.

### Step 2 — Use the ecosystem via CLI-Hub

```bash
pip install cli-anything-hub

cli-hub list                 # browse the registry
cli-hub search image         # search by keyword
cli-hub info gimp            # inspect one CLI
cli-hub install gimp         # install from CLI-Hub
cli-hub launch gimp          # run an installed CLI
cli-hub update gimp          # update
cli-hub uninstall gimp       # remove
```

CLI-Hub v0.2.0+ also serves **public CLIs** from multiple install sources
(`pip`, `npm`, `brew`, bundled/system tools) via `public_registry.json`.
If a harness wraps desktop software (GIMP, Blender, LibreOffice, …),
install that upstream application too.

### Step 3 — Give agents the meta-skill

```bash
npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill -g -y
```

Then prompt the agent:

```text
Find appropriate CLI software in CLI-Hub and complete the task: ...
```

Works with Claude Code, Codex, OpenClaw, Nanobot, Antigravity, and other
SKILL-compatible agents. The monorepo's per-harness skills are also
discoverable: `npx skills add HKUDS/CLI-Anything --list`.

### Step 4 — Generate a new harness (7-phase pipeline)

Claude Code (primary platform):

```bash
/plugin marketplace add HKUDS/CLI-Anything
/plugin install cli-anything

/cli-anything ./gimp                              # local source
/cli-anything https://github.com/blender/blender  # GitHub repo
```

The pipeline runs: **1 Analyze → 2 Design → 3 Implement (Click CLI + REPL +
JSON + undo/redo) → 4 Plan tests → 5 Write tests → 6 Document (+ Phase 6.5
SKILL.md generation) → 7 Publish** (`setup.py`, PATH install).
Other platforms (Codex, OpenCode, OpenClaw, Pi, Hermes, Qodercli, Copilot
CLI, Goose) follow the same methodology — install commands are in
[`references/commands.md`](references/commands.md).

If `/cli-anything` is unrecognized: `/reload-plugins`, verify with
`/help cli-anything`, reinstall from the marketplace, and only on older
builds try the legacy `/cli-anything:cli-anything` form.

### Step 5 — Refine, test, validate

```bash
/cli-anything:refine ./gimp                                  # broad gap analysis
/cli-anything:refine ./gimp "batch processing and filters"   # focused
/cli-anything:test ./gimp                                    # run tests, update TEST.md
/cli-anything:validate ./gimp                                # check against HARNESS.md
```

Refinement is incremental and non-destructive — run it repeatedly to push
coverage toward production quality. `HARNESS.md` is the methodology SOP
(source of truth) the validator checks against.

### Step 6 — Use a generated CLI

```bash
cd <software>/agent-harness && pip install -e .

cli-anything-gimp --help                     # discoverable via --help/which
cli-anything-gimp --json layer add -n "BG"   # structured output for agents
cli-anything-gimp                            # bare command → stateful REPL
```

Every harness ships dual modes (REPL + subcommands), `--json` on every
command, and a generated `SKILL.md` at `skills/cli-anything-<name>/SKILL.md`.

### Step 7 — Plugin-style installation alongside oh-my-skills

This skill folder is plugin-installable through the standard oh-my-skills
flow so the wrapper, references, and installer script land on disk for any
supported agent runtime:

```bash
# Project install (writes into .agents/skills/cli-anything/)
npx skills add https://github.com/akillness/oh-my-skills --skill cli-anything

# Global install for every detected agent
npx skills add -g https://github.com/akillness/oh-my-skills --skill cli-anything

# Target specific agents
npx skills add -g https://github.com/akillness/oh-my-skills --skill cli-anything -a claude-code -a codex -y
```

The skill also ships [`scripts/install.sh`](scripts/install.sh) — a
one-shot CLI-Hub installer (venv-aware uv/pip selection, PEP 668-safe) with
an optional meta-skill install via `CLI_ANYTHING_META_SKILL=1`.

## Output format

When the user asks `cli-anything` for help, return a compact brief:

```markdown
# cli-anything Routing Brief

## Scope
- Mode: use-ecosystem | empower-agents | generate-harness | iterate-harness
- Target software: <name or repo> | undecided
- Agent platform: claude | codex | opencode | openclaw | pi | hermes | copilot | other

## Recommended next move
- install-cli-hub | cli-hub-search | install-meta-skill | install-platform-plugin | run-/cli-anything | refine | test | validate

## Why
- 2-3 bullets grounded in the user's packet

## Route-outs
- `harness` for agent-team architecture (not software wrappers)
- `browser-harness` for no-codebase GUI/browser targets
- `ccpi-marketplace` for general Claude plugin browsing
```

## Best practices

1. **Search the registry before generating** — 40+ harnesses already
   exist; `cli-hub search` costs seconds, a 7-phase build costs a session.
2. **Install the real backend** — harnesses call actual software with zero
   compromise dependencies; tests fail (not skip) when backends are missing.
3. **Use `--json` for agent consumption** — every command supports it;
   human-readable tables are for debugging only.
4. **Verify outputs, not exit codes** — the methodology checks magic bytes,
   ZIP/OOXML structure, pixel/audio analysis; do the same with artifacts.
5. **Run `/cli-anything:refine` iteratively** — a single generation pass
   rarely covers all capabilities; each refine run is incremental.
6. **Windows needs `bash`** — install Git for Windows (`bash` + `cygpath`)
   or use WSL before running plugin commands.

## References

- Upstream repo: <https://github.com/HKUDS/CLI-Anything>
- CLI-Hub (web): <https://hkuds.github.io/CLI-Anything/>
- Methodology SOP: [`cli-anything-plugin/HARNESS.md`](https://github.com/HKUDS/CLI-Anything/blob/main/cli-anything-plugin/HARNESS.md)
- Quickstart: [`cli-anything-plugin/QUICKSTART.md`](https://github.com/HKUDS/CLI-Anything/blob/main/cli-anything-plugin/QUICKSTART.md)
- Publishing guide: [`cli-anything-plugin/PUBLISHING.md`](https://github.com/HKUDS/CLI-Anything/blob/main/cli-anything-plugin/PUBLISHING.md)
- Technical report: <https://arxiv.org/abs/2606.03854>
- Installer script: [`scripts/install.sh`](scripts/install.sh)
- Command + platform reference: [`references/commands.md`](references/commands.md)
- Adjacent skills: `../harness/SKILL.md`, `../ccpi-marketplace/SKILL.md`,
  `../browser-harness/SKILL.md`, `../scrapling/SKILL.md`
- License: Apache-2.0 (see upstream `LICENSE`)
