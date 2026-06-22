# Agent Skills

<div align="center">

[![Skills](https://img.shields.io/badge/Skills-142-blue?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![Platform](https://img.shields.io/badge/Platform-Claude%20%7C%20Gemini%20%7C%20Codex%20%7C%20OpenCode-orange?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![BMAD](https://img.shields.io/badge/BMAD-1.2.0-purple?style=for-the-badge)](docs/bmad/README.md)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

**142 local skill folders · 142 installable skills · TOON Format · Cross-platform**

[Quick Start](#-quick-start) · [Skills List](#-skills-list) · [Installation](#-installation) · [한국어](README.ko.md)

</div>

---

## 💡 What is Agent Skills?

**142 local skill folders · 142 installable skills · TOON Format · Cross-platform**

Agent Skills is a curated collection with 142 local skill folders and 142 installable skills for LLM-based development workflows. Built around `ooo` (spec-first), `bmad` (planning), and `plannotator` (review) as the core orchestration trio, it provides:
≔99pk..101dv
<!-- WHATS-NEW:START -->

## 🆕 What's New in v2026-06-20

| Change | Details |
|--------|---------|
| **slides-grab: point-and-edit AI slide decks in HTML/CSS** | Added `slides-grab` — a routing-first wrapper around [slides-grab](https://github.com/NomaDamas/slides-grab) (NomaDamas, MIT), the **open-source Claude Design alternative** and "best harness + editor + linter for generating slides in Claude Code / Codex". The skill plans (agent drafts a structured outline), designs (each slide is a self-contained `slide-XX.html`), edits (pure-JS browser editor where you drag a bbox over any region and ask the agent to rewrite just that area, or hand-edit text/size/bold), and exports (capture-or-print PDF, per-slide PNG incl. Instagram 1:1 card-news, plus experimental/unstable PPTX and Figma-importable PPTX). Picks an install path (npm package + `npx skills add`, or clone), a deck workspace (`--slides-dir`, multi-deck `decks/<name>/`), one of 35 design styles, and the supported asset flow (local `./assets/<file>` only — image via god-tibo-imagen/codex/nano-banana, fetch-video via yt-dlp, tldraw .tldr→SVG), validating with `slides-grab validate` before any export. Ships `scripts/install.sh` (npm install + Playwright Chromium + `npx skills add`), a feature + command reference, `SKILL.toon`, and `evals/evals.json`. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill slides-grab`. Route-outs: `drawio`/`mermaid` (editable vector diagrams embedded in a slide), `presentation-builder` (packet-first planning + export-target handoff), `god-tibo-imagen` (standalone AI image generation), `open-design` (broad local design-artifact generation). 141 → **142 skills**. |

## 🆕 What's New in v2026-06-18
- Unified orchestration across Claude Code, Gemini CLI, OpenAI Codex, and OpenCode
- Plan → Execute → Verify → Cleanup automated pipelines
- Multi-agent team coordination with parallel execution

---

## 🚀 Quick Start

> **Prerequisite**: Install `skills` CLI before running `npx skills add`.
>
> ```bash
> npm install -g skills
> ```

```bash
# Send to your LLM agent — it will read and install automatically
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

| Platform | First Command |
|----------|--------------|
| Claude Code | `ooo interview "task"` or `/team "task"` |
| Gemini CLI | `bmad "task"` or `ooo interview "task"` |
| Codex CLI | `bmad "task"` or `ooo interview "task"` |
| OpenCode | `bmad "task"` or `ooo interview "task"` |

---

## 🏗 Architecture

The repository's signature flow: **search compactly → make knowledge durable →
build spec-first → run autonomously → feed results back**. Each box is a real
skill in this catalog.

<img src="assets/architecture.svg" alt="Agent Skills Architecture" width="100%">

---

<!-- WHATS-NEW:START -->

## 🆕 What's New in v2026-06-18

| Change | Details |
|--------|---------|
| **codeflow: visualize codebase architecture in seconds** | Added `codeflow` — a routing-first wrapper around [CodeFlow](https://github.com/braedonsaunders/codeflow) (braedonsaunders, MIT), a **zero-build single `index.html` browser app** (React 18 + D3.js 7 + Babel from pinned CDNs) that turns any GitHub repo, local folder, PR, or markdown/Obsidian vault into an **interactive architecture map** — 100% client-side, **no backend, no build, no data collection**. The skill picks an input (public repo, private repo with a token kept in browser memory, local files/folder, PR URL, or markdown vault), chooses a visualization mode (**folder / layer / churn / blast**), and reads the analysis: an **interactive dependency graph**, **blast-radius** "what breaks if I change this", **code ownership** from git history, a heuristic **security scanner** (hardcoded secrets, SQL injection, `eval()`, debug statements), **pattern / anti-pattern detection**, an **A–F health score**, an **activity heatmap**, and **PR impact analysis** — then exports JSON / Markdown / text / SVG / PDF or drops a self-updating **CodeFlow Card** SVG on a README via GitHub Action. Covers 40+ languages. Ships `scripts/install.sh` (clone-or-update + open `index.html`, `CODEFLOW_NO_OPEN` knob), a feature + language reference, `SKILL.toon`, and `evals/evals.json`. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill codeflow`. Route-outs: `drawio`/`mermaid` (editable hand-authored diagrams), `semble` (token-efficient agent code search), `codebase-search` (repo-navigation packet), `graphify` (durable committed knowledge graph). 140 → **141 skills**. |


## 🆕 What's New in v2026-06-16

| Change | Details |
|--------|---------|
| **typesense: installable typo-tolerant search environment** | Added `typesense` — a routing-first wrapper around [Typesense](https://github.com/typesense/typesense) (GPL-3.0 server, Apache-2.0 clients), the open-source **Algolia / ElasticSearch alternative**: a single C++ binary with no runtime dependencies and <50ms instant search. The skill picks a server mode (**official Docker image**, downloadable binary, or managed **Typesense Cloud**), installs an API client (Python/JS/PHP/Ruby official; Go/Dart/C# community), designs a typed collection schema, indexes documents (per-doc or JSONL bulk `upsert`), and drives search with **typo tolerance, faceting/filtering, geo-search, query-time sorting, grouping/distinct, synonyms, curation, scoped API keys, federated multi-search, and vector/hybrid** — then wires an InstantSearch.js UI and a Raft-based HA cluster for production. Ships `scripts/install.sh` (Docker server bring-up + Python client, venv/PEP 668-aware), a client/integration + search-parameter reference, `SKILL.toon`, and `evals/evals.json`. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill typesense`. Route-outs: `opik`/`langsmith` (LLM trace/eval observability), `semble` (agent code search), `monitoring-observability` (non-search telemetry). 139 → **140 skills**. |

## 🆕 What's New in v2026-06-15

| Change | Details |
|--------|---------|
| **ponytail: the laziest senior dev in the room** | Added `ponytail` — a routing-first wrapper around DietrichGebert's [Ponytail](https://github.com/DietrichGebert/ponytail) ruleset that makes the agent write the least code that fully solves the task. Before writing anything, it stops at the first rung that holds: **does this need to exist (YAGNI) → stdlib → native platform feature → already-installed dependency → one line → only then the minimum that works**, and marks every shortcut with a `ponytail:` comment naming its upgrade path so deferred work becomes a ledger, not amnesia. Intensity is set with `lite / full / ultra / off` and persists across turns; commands cover diff review (`/ponytail-review` → delete-list), whole-repo audit (`/ponytail-audit`), and debt harvest (`/ponytail-debt`). Lazy, never negligent: trust-boundary validation, data-loss handling, security, and accessibility are never cut. Upstream benchmarks report 80–94% less code, 3–6× faster, and 47–77% cheaper across Haiku/Sonnet/Opus. Ships `scripts/install.sh` (wires the upstream marketplace plugin/extension per runtime — Claude Code, Codex, Gemini, Pi, OpenCode) and a per-runtime command crosswalk. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill ponytail`. Route-outs: `caveman` (communication compression, not code volume), `code-refactoring` (behavior-preserving cleanup), `ai-slop-cleaner` (AI-generated bloat), `code-review` (severity-rated review). 137 → **138 skills**. |
| **drawio: from text to professional diagrams** | Added `drawio` — a wrapper around Agents365-ai's [drawio-skill](https://github.com/Agents365-ai/drawio-skill) (MIT) that turns natural-language descriptions into editable `.drawio` XML and exports them to PNG / SVG / PDF / JPG via the **native draw.io desktop CLI** (no MCP server, no daemon), or turns an existing codebase (Python / JS-TS / Go / Rust) into an auto-laid-out structure diagram. Covers 6 diagram presets (ERD, UML class, sequence, architecture, ML/DL, flowchart), search across **10,000+ official** AWS/Azure/GCP/Cisco/Kubernetes/UML/BPMN shapes (`shapesearch.py`), **321 AI/LLM brand logos** that draw.io ships none of (`aiicons.py`), a Graphviz-backed extract → auto-layout → validate pipeline with transitive reduction and nested containers, plus a vision self-check + auto-fix (≤2 rounds) and a 5-round iterative refinement loop. Ships `scripts/install.sh` (per-platform draw.io CLI detect/install + upstream skill pull, optional Graphviz) and a command/flag reference. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill drawio`. Route-outs: `mermaid`/`plantuml` (diagrams-as-code in git), `excalidraw`/`tldraw` (hand-drawn looks), `presentation-builder` (slide decks). 138 → **139 skills**. |

## 🆕 What's New in v2026-06-11

| Change | Details |
|--------|---------|
| **spec-stack: Write → Freeze → Run, verified** | Added `spec-stack` — a composition skill that wires `spec-kit`, `ooo`, and `cli-anything` into one spec-driven delivery stack with a single rule: spec-kit writes, ooo freezes and loops, cli-anything is the hands. Routes between three patterns: **full-stack** (`/speckit.constitution` → `/speckit.specify` → ooo interview → immutable seed with machine-checkable acceptance criteria and tool-naming constraints → `cli-hub search/install` → run/ralph ↔ evaluate with artifact-level `--json` evidence), **loop-only** (ooo seed + ralph without document artifacts), and **docs-only** (full `/speckit.*` pipeline for multi-agent doc sharing). Documents the handoff map (spec.md → seed.yaml → harness evidence, one-way flow) and explicit anti-patterns: two spec SSOTs, generate-before-`cli-hub search`, seedless ralph loops, and exit-code-only verification. Ships `scripts/install.sh` (uv/pipx/pip; installs `specify-cli` + `cli-anything-hub`, ooo via `SPEC_STACK_OOO=1` or the Claude plugin) and a command crosswalk reference. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill spec-stack`. Route-outs: `spec-kit`/`ooo`/`cli-anything` (single-layer work), `bmad` (next planning artifact), `plannotator` (plan approval). 135 → **137 skills** (also re-syncs the published count to the 137 live skill folders — docs had drifted one below the tracked folder count since v2026-06-08). |
| **cli-anything: make any software agent-native** | Added `cli-anything` — a routing-first wrapper around HKUDS's [CLI-Anything](https://github.com/HKUDS/CLI-Anything) ecosystem that picks one of four modes: install ready-made harnesses via the CLI-Hub package manager (`pip install cli-anything-hub` → `cli-hub list/search/info/install/launch`), give agents the autonomous discovery meta-skill (`npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill -g -y`), generate a new harness from any codebase or GitHub repo through the 7-phase pipeline (`/plugin install cli-anything` → `/cli-anything <path>` on Claude Code, plus Codex/OpenCode/OpenClaw/Pi/Hermes/Qodercli/Copilot CLI installs), or iterate with `/cli-anything:refine`/`:test`/`:validate`. 40+ production harnesses (GIMP, Blender, LibreOffice, OBS, Draw.io, ComfyUI, Ollama, Godot, QGIS, FreeCAD, …) with 2,461 passing tests; generated CLIs ship Click commands, stateful REPL, `--json` output, and auto-generated SKILL.md. Ships a PEP 668-safe `scripts/install.sh` (venv-aware uv/pip, optional meta-skill via `CLI_ANYTHING_META_SKILL=1`) and a platform/command reference. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill cli-anything`. Route-outs: `harness` (agent-team architecture), `browser-harness` (no-codebase GUI targets), `ccpi-marketplace` (general plugin browsing). 134 → **135 skills**. |

## 🆕 What's New in v2026-06-10

| Change | Details |
|--------|---------|
| **opik: open-source LLM observability, evaluation & optimization** | Added `opik` — a routing-first wrapper around Comet's [Opik](https://github.com/comet-ml/opik) platform that picks the right server mode (Comet.com cloud, local Docker Compose via `./opik.sh` with `--infra`/`--backend`/`--guardrails` profiles, or Kubernetes/Helm), installs and configures the Python SDK (`pip install opik` + `opik configure`), wires tracing through `@opik.track` or one of 50+ framework integrations (OpenAI, Anthropic, LangChain, LangGraph, LlamaIndex, CrewAI, DSPy, Ollama, Bedrock, Vercel AI SDK, …), and drives LLM-as-a-judge evaluation (Hallucination, Moderation, Answer Relevance, Context Precision), Datasets/Experiments with PyTest CI gates, production monitoring (40M+ traces/day), Opik Agent Optimizer, and Opik Guardrails. Ships `scripts/install.sh` (uv → pip, optional local self-host) and an integration reference, and is plugin-installable via `npx skills add https://github.com/akillness/jeo-skills --skill opik`. Route-outs: `langsmith` (LangSmith stack), `monitoring-observability` (non-LLM dashboards/alerts), `data-analysis` (offline KPI interpretation). 133 → **134 skills**. |

## 🆕 What's New in v2026-06-08

| Change | Details |
|--------|---------|
| **spec-kit: GitHub Spec-Driven Development workflow** | Added `spec-kit` — a routing-first wrapper around GitHub's [`specify` CLI](https://github.com/github/spec-kit) that installs the tool, bootstraps a project for one of 30+ supported AI agents (Claude Code, Copilot, Gemini, Codex, Cursor, opencode, Qwen, Kiro, …), and drives the SDD command pipeline (`/speckit.constitution` → `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.analyze` → `/speckit.tasks` → `/speckit.checklist` → `/speckit.implement`). Ships an idempotent `scripts/install.sh` (uv → pipx fallback) and a command reference, and is plugin-installable via `npx skills add https://github.com/akillness/jeo-skills --skill spec-kit`. Route-outs: `ooo` (vendor-neutral spec-first loop), `bmad` (packet-first BMAD/BMM routing), `plannotator` (review/approval gate). 132 → **133 skills**. |

## 🆕 What's New in v2026-06-01

| Change | Details |
|--------|---------|
| **agenticskills: one-shot installer for the oh-my-gods bundle** | Added `agenticskills` — a portable skill that wraps the official [`akillness/oh-my-gods`](https://github.com/akillness/oh-my-gods) `install.sh` so the 80+ `.god-skills/` catalog (agent-browser, agent-workflow, ai-research-skills, api-design, …) can be installed across Claude Code, Codex CLI, Antigravity/Gemini, and OpenCode in a single command. Exposes the upstream env knobs (`PLATFORM`, `WITH_LANGCHAIN`, `INSTALL_MODE`, `SKIP_BACKUP`), documents the curl-pipe and review-first flows, and lives alongside the existing skills without destructive overlap. Triggers on: `AgenticSkills`, `oh-my-gods`, `god-skills`, install gods skills. |

> 📜 Older entries: [`changelog/en/`](changelog/en/) (monthly files, newest first).

<!-- WHATS-NEW:END -->

---

## 📦 Installation

> **Cross-platform**: macOS, Linux, and Windows (Git Bash / WSL2) are all supported. The installer auto-detects your OS in Step 0 and picks the right package manager (`brew` / `snap` / `winget`) and paths (`$HOME` / `$USERPROFILE` / `$XDG_DATA_HOME`) for each tool.

### Step 0: Install `skills` CLI

```bash
npm install -g skills
skills --version
```

### Vercel `skills` CLI scope and paths

The Vercel `skills` CLI installs from GitHub shorthand, full Git URLs, direct skill paths, or local folders:

```bash
# Project install: writes to the current repo's agent skill directory
npx skills add https://github.com/akillness/jeo-skills --skill deepinit --skill deep-dive

# Global install: available to that agent across projects
npx skills add -g https://github.com/akillness/jeo-skills --skill deepinit --skill deep-dive

# Target specific agents
npx skills add -g https://github.com/akillness/jeo-skills --skill deepinit --skill deep-dive -a claude-code -a codex -y
```

| OS / shell | Global examples | Project examples |
|------------|-----------------|------------------|
| macOS / Linux | `$HOME/.claude/skills/`, `$HOME/.codex/skills/`, `$HOME/.gemini/skills/`, `$HOME/.config/opencode/skills/`, `$HOME/.agents/skills/` | `.claude/skills/`, `.agents/skills/` |
| Windows PowerShell | `$env:USERPROFILE\.claude\skills\`, `$env:USERPROFILE\.codex\skills\`, `$env:USERPROFILE\.gemini\skills\`, `$env:APPDATA\opencode\skills\`, `$env:USERPROFILE\.agents\skills\` | `.claude\skills\`, `.agents\skills\` |
| Windows Git Bash / WSL2 | `$HOME/.claude/skills/`, `$HOME/.codex/skills/`, `$HOME/.gemini/skills/`, `$HOME/.config/opencode/skills/`, `$HOME/.agents/skills/` | `.claude/skills/`, `.agents/skills/` |

Project scope is the default and should be committed when the team needs the same skill behavior. Global scope uses `-g` and is better for personal defaults. Agent-specific paths are selected with `-a`; the portable common layer is `.agents/skills/`.

### For LLM Agents (recommended — handles all platforms automatically)

```bash
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

### Choose by Platform

#### Claude Code

```bash
npx skills add https://github.com/akillness/jeo-skills \
  --skill omc --skill plannotator --skill agentation \
  --skill ooo --skill vibe-kanban
```

#### Gemini CLI

```bash
npx skills add https://github.com/akillness/jeo-skills \
  --skill ohmg --skill ooo --skill vibe-kanban
antigravity extensions install https://github.com/akillness/jeo-skills
```

#### Codex CLI

```bash
npx skills add https://github.com/akillness/jeo-skills \
  --skill omx --skill ooo
```

#### Core Tool Setup (all platforms)

```bash
# ooo MCP — spec-first control loop
pip install "ouroboros-ai[all]"
claude mcp add ooo -s user -- ouroboros mcp      # Claude Code
# Codex: appends [mcp_servers.ooo] to ~/.codex/config.toml via setup-all-skills-prompt.md
# (Codex CLI reads TOML, not mcp.json — prior JSON-based registration was a silent no-op)

# semble MCP — token-efficient code search
claude mcp add semble -s user -- uvx --from "semble[mcp]" semble

# rtk — token-optimized shell output
# macOS: brew install rtk  |  Linux: cargo install rtk  |  Windows: winget install rtk
rtk init -g

# oh-my-claudecode plugin
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode && setup omc
```

---

## 📚 Skills List

> Full manifest: `.agent-skills/skills.json` · each folder's `SKILL.md` · 142 local skill folders = 142 total installable skills

### 🎯 Core Orchestration (15)

| Skill | Keyword | Platform | Description |
|-------|---------|----------|-------------|
| `ooo` | `ooo`, `ouroboros`, `ooo interview` | All | Spec-first control loop — clarify, freeze, execute, verify. Entry point for any ambiguous or multi-step task |
| `bmad` | `bmad`, `workflow-init`, `workflow-status` | All | Packet-first BMAD/BMM planning front door — classify packet, choose next artifact or gate, route runtime/review work outward |
| `omc` | `omc`, `autopilot`, `ralph`, `ulw`, `ultraqa`, `ccg`, `/team`, `omc team`, `omc ask`, `cancelomc` | Claude | Claude-first orchestration router for oh-my-claudecode — distinguishes plugin slash skills from the `omc` shell CLI, maps `/team`, `/autopilot`, `/ultrawork`, `/ultraqa` intents to OMX/OMA when requested, handles recovery/state issues, and routes adjacent work outward |
| `harness` | `harness`, `build a harness` | All | Meta-skill: design domain-specific agent teams, generate `.claude/agents/` + `.claude/skills/` files, validate harness |
| `omx` | `omx`, `$plan`, `$ralph`, `$team`, `$autopilot`, `$ulw`, `$ultraqa`, `$deep-interview`, `$ralplan` | Codex | Codex workflow layer with Claude parity — `$team` for coordinated workers, `$autopilot` for full autonomous builds, `$ulw`/`$ultrawork` for burst parallelism, `$ultraqa` for QA fan-out, plus tmux/psmux team runtime and omx explore/sparkshell |
| `autopilot` | `$autopilot`, `autopilot`, `auto pilot`, `full-auto` | Codex | Exact-name Codex/OMX front door for idea-to-verified-code autonomous builds |
| `team` | `$team`, `team mode`, `omx team`, `coordinated workers` | Codex | Exact-name coordinated multi-agent workflow; prefers `omx team` when the runtime is installed |
| `ultrawork` | `$ultrawork`, `$ulw`, `ultrawork`, `parallel work` | Codex | Exact-name high-parallelism burst workflow for independent implementation or cleanup lanes |
| `ultraqa` | `$ultraqa`, `$ultaqa`, `ultraqa`, `QA cycling` | Codex | Exact-name QA cycling workflow for tests/build/lint/typecheck/review loops |
| `ohmg` | `ohmg`, `oh-my-agent`, `oma`, `.agents`, `/plan`, `/work`, `/orchestrate`, `/review` | Gemini / Antigravity | Portable OMA harness entry — keeps `.agents` canonical, regenerates vendor views with `oma link`, and maps team/autopilot/ultrawork/ultraqa intents to `/orchestrate`, `/plan` → `/work`, `/ultrawork`, `/review`, or `oma agent:parallel` with Antigravity limits stated |
| `ooo` | `ooo`, `ouroboros`, `ooo ralph` | All | Ouroboros spec-first development loop — Socratic interview, immutable seed/spec, drift-aware execution, persistent completion until verification passes. Plugin: `claude plugin marketplace add Q00/ouroboros` |
| `bmad` | `bmad`, `workflow-init`, `workflow-status` | All | Packet-first BMAD/BMM front door — classify the current packet, choose the next artifact or gate, and route runtime / review / execution detail outward |
| `spec-kit` | `spec-kit`, `speckit`, `specify`, `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement` | All | GitHub Spec-Driven Development wrapper — install `specify-cli`, bootstrap a project for one of 30+ agents (Claude / Copilot / Gemini / Codex / Cursor / opencode / Qwen / Kiro / …), and drive the constitution → specify → clarify → plan → analyze → tasks → checklist → implement pipeline. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill spec-kit` |
| `spec-stack` | `spec-stack`, `spec stack`, `write freeze run`, `spec to verified`, `speckit + ooo` | All | Composition wrapper for `spec-kit` × `ooo` × `cli-anything` — spec-kit writes the spec, ooo freezes it as an immutable seed and loops until verification passes, cli-anything supplies agent-native CLI harnesses whose `--json` output is the evaluate-step evidence; three patterns (full-stack / loop-only / docs-only) with one-way spec → seed flow and explicit anti-patterns. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill spec-stack` |
| `bmad-gds` | `bmad-gds` | All | Game-production orchestrator — turn ideas, GDDs, playtest notes, bugs, and launch beats into one milestone-aware next artifact |
| `bmad-idea` | `bmad-idea` | All | Pre-planning idea router — turn rough product, GTM, consulting, or game ideas into one concept artifact and the next handoff |
| `deep-dive` | `deep-dive`, `deep dive`, `trace and interview` | All | Cross-runtime investigation pipeline — trace causal hypotheses, inject evidence into requirements, validate artifacts, then hand off through OMC, OMX, or OMA |
| `deepinit` | `deepinit`, `deep init`, `AGENTS.md` | All | Generate or refresh hierarchical AGENTS.md documentation with manual-note preservation, runtime-state exclusion, and parent-link validation |
| `survey` | `survey` | All | Bounded pre-implementation landscape scan with reusable `.survey/{slug}/` artifacts plus validator-backed artifact-contract checks |
| `clawteam` | `clawteam`, `claw team`, `multi-agent team` | All | Route ClawTeam runtime requests — manual-team, template-team, worker-agent modes with one honest operator packet before touching commands |
| `ccpi-marketplace` | `ccpi`, `tons of skills`, `plugin marketplace` | All | Operate the Tons of Skills marketplace via the ccpi CLI and Claude plugin marketplace commands — search, install, update, list skills |

### 📋 Planning & Review (12)

| Skill | Keyword | Description |
|-------|---------|-------------|
| `plannotator` | `plan` | Visual approval gate for agent plans/diffs — annotate, approve, request changes, or save reviewed plans |
| `agentation` | `annotate` | Exact rendered-UI feedback router — choose copy-paste review, watch-loop sync, self-driving critique, or platform setup |
| `browser-harness` | `browser-harness` | Self-healing LLM browser automation via CDP for Claude Code, Codex, Antigravity, Gemini CLI, and OpenCode — replaces `agent-browser`, adds Claude-safe screenshot handling, and keeps helper/domain-skill repair loops local |
| `playwriter` | `playwriter` | Running-browser automation for authenticated Chrome sessions and MCP browser reuse |
| `vibe-kanban` | `kanbanview` | Coding-board control plane for bounded coding cards, tracker-linked workspaces, review queues, worktree isolation, and PR handoff |
| `triage` | `triage` | Issue state machine: needs-triage → needs-info → ready-for-agent / ready-for-human / wontfix. All AI comments include AI disclaimer |
| `to-issues` | `to-issues` | Convert plans/specs into independently-grabbable vertical slice issues (HITL or AFK classification) |
| `to-prd` | `to-prd` | Generate structured PRDs from conversation context without interviewing — problem statement, user stories, modules, testing decisions |
| `grill-me` | `grill-me` | Systematic plan stress-testing through relentless one-question-at-a-time interviewing across the full decision tree |
| `grill-with-docs` | `grill-with-docs` | Design review that stress-tests plans against domain model, sharpens terminology, and updates CONTEXT.md / ADRs inline |
| `improve-codebase-architecture` | `improve-codebase-architecture` | Surface shallow modules and propose deepening opportunities for testability using deletion-test, seam, and locality vocabulary |
| `zoom-out` | `zoom-out` | Get higher-level architectural perspective: maps all relevant modules, caller relationships, dependencies using domain vocabulary |

### 🤖 Agent Development (6)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `prompt-repetition` | Decision-first prompt repetition skill for non-reasoning/lightweight LLMs — long-context retrieval, options-first MCQ, position-sensitive lookup, and explicit route-outs to retrieval or stronger models | All |
| `skill-standardization` | Validate/rewrite SKILL.md, canonicalize duplicates, and keep repo-root validator flows plus derived discovery surfaces (`skills.json`, README/setup, `SKILL.toon`) in sync | All |
| `microsoft-agent-framework` | Design enterprise-grade agent systems with Microsoft's agent framework — role separation, workflow control, policy enforcement, and multi-agent coordination patterns | All |
| `openai-agents-python` | Build and operate multi-agent workflows with OpenAI Agents SDK (Python) — define agents/tools/handoffs, add guardrails, trace with LangSmith, run async pipelines | All |
| `pydantic-ai` | Build typed LLM applications with PydanticAI — schema-constrained outputs, tool integration, validation, retries, and dependency injection for production AI apps | All |
| `cli-anything` | Make any software agent-native via HKUDS CLI-Anything — CLI-Hub package manager (`cli-hub list/search/install/launch`), agent meta-skill for autonomous CLI discovery, 7-phase harness generation from any codebase (`/cli-anything`), and refine/test/validate iteration; 40+ harnesses, 2,461 tests, REPL + `--json` CLIs. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill cli-anything` | All |

### ⚙️ Backend (7)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `api-design` | Contract-first REST/GraphQL API design, compatibility review, and handoff | All |
| `api-documentation` | Developer-facing API docs anchor for reference portals, quickstarts, SDK/webhook guides, truthful examples, and auth/error guidance | All |
| `authentication-setup` | Product-auth setup routing across hosted/framework-native/platform-native auth, sessions/JWTs, org data, and enterprise SSO handoff | All |
| `backend-testing` | Packet-first backend testing for coverage plans, fixture/reset strategy, contract/API protection, flaky-suite stabilization, and local-vs-CI lane splits | All |
| `database-schema-design` | Packet-first storage-model and migration-safety design for relational/document/hybrid schemas, queryable-vs-flexible fields, and route-outs to API/auth/testing/reporting neighbors | All |
| `payloadcms` | Operate Payload CMS (Next.js-native headless CMS) — bootstrap app, configure collections/globals, manage auth/access control, migrations, REST/GraphQL/Local API, and plugin authoring | All |
| `supabase-agent-skills` | Install and use Supabase Agent Skills with AI coding agents — covers install modes, skill selection, Supabase CLI integration, and agent-assisted database/auth/storage workflows | All |

### 🎨 Frontend (14)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `design-system` | Canonical frontend UI-system anchor for token governance, visual-language rules, primitive naming, and cross-surface system direction; routes component API, responsive layout, accessibility remediation, and broad UI critique to adjacent skills | All |
| `frontend-design-system` | Compatibility alias for `design-system` when legacy tooling or exact-name workflows still expect the old name | All |
| `stitch-skills` | Agent Skills for Stitch MCP — generate high-fidelity UI screens, multi-page websites, DESIGN.md docs, enhance prompts, convert to React/shadcn-ui, Remotion walkthrough videos. Plugin: `claude plugin marketplace add google-labs-code/stitch-skills` | All |
| `compresso` | Free offline desktop video/image compression (Tauri+React) — batch compress, trim/split videos, convert formats, embed subtitles, manage metadata. Uses FFmpeg/pngquant/jpegoptim/gifski. Plugin: `claude plugin marketplace add codeforreal1/compressO` | All |
| `open-design` | Local-first open-source design tool — generate prototypes, decks, and media artifacts using installed coding agents. 72 built-in design systems, 5 visual directions, multi-format export (HTML/PDF/PPTX/ZIP). Plugin: `claude plugin marketplace add nexu-io/open-design` | All |
| `pretext` | Fast, accurate multiline text measurement & layout without DOM reflow — `prepare`/`layout` for height, `prepareWithSegments`/`layoutWithLines` for per-line access, emoji/CJK/RTL support, DOM/Canvas/SVG output. npm: `@chenglou/pretext` | All |
| `react-best-practices` | Measurement-led React & Next.js performance audits for waterfalls, bundle size, RSC/client boundaries, hydration, rerender churn, and slow routes | All |
| `react-grab` | Browser element context capture — point at UI element, copy React component name, file path, HTML to clipboard for AI agents | All |
| `vercel-react-best-practices` | Compatibility alias for `react-best-practices` when legacy tooling or exact-name workflows still expect the Vercel variant | Claude · Gemini · Codex |
| `responsive-design` | Routing-first responsive layout strategy for page-shell, component-slot, dense-data, media, and reflow-verification packets | All |
| `state-management` | React/fullstack ownership-packet decisions across local, Context, URL/form, client-store, and server-state/router data layers | All |
| `ui-component-patterns` | Routing-first reusable-component architecture for primitive-boundary, slot-anatomy, controlled-ownership, alternate-root, and docs-verification packets | All |
| `web-accessibility` | Routing-first accessibility remediation and verification for semantics, keyboard/focus, labels/announcements, reflow, media alternatives, and routed-app feedback | All |
| `web-design-guidelines` | Broad web UI audit for hierarchy, clarity, consistency, states, responsiveness basics, and accessibility basics | All |

### 🔍 Code Quality (10)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `agentic-skills` | Production-grade engineering framework (Google practices) — spec-driven development, incremental implementation, TDD, security hardening, performance optimization, and disciplined git/CI/CD workflows across `/spec` `/plan` `/build` `/test` `/review` `/code-simplify` `/ship` phases. Plugin: `/plugin marketplace add addyosmani/agent-skills` | All |
| `code-refactoring` | Behavior-preserving structural cleanup, decomposition, duplication removal, and codemod planning | All |
| `code-review` | Evidence-first diff / PR review with severity, missing-proof checks, and route-outs | All |
| `debugging` | Routing-first diagnosis for concrete bugs, regressions, flaky failures, and env-specific behavior; routes raw logs to `log-analysis` and perf-only work to `performance-optimization` | All |
| `performance-optimization` | Artifact-first measurement-led bottleneck analysis and tuning across latency, throughput, memory, bundle, CWV, and frame-budget work | All |
| `testing-strategies` | Packet-first validation policy for merge-gate truth, release-only proof, scheduled breadth, and cross-domain test-policy handoffs | All |
| `diagnose` | Systematic six-phase debugging: build feedback loop → reproduce → hypothesize → instrument → fix+test → cleanup. Invest in Phase 1 (fast feedback loop) first | All |
| `tdd` | Red-green-refactor TDD with vertical slices — tests verify behavior through public interfaces, not implementation details | All |
| `migrate-to-shoehorn` | Migrate TypeScript test `as` assertions to type-safe `fromPartial()`, `fromAny()`, `fromExact()` from @total-typescript/shoehorn. Test code only. | All |
| `aider-cli-workflow` | Run a safe, reviewable Aider CLI coding loop — model setup, edit scope control, test-first prompting, diff review, and commit hygiene for local repositories | All |

### 🏗 Infrastructure (18)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `agenticskills` | One-shot installer for the `akillness/oh-my-gods` bundle (80+ god-skills) — wraps the upstream `install.sh`, honors `PLATFORM`, `WITH_LANGCHAIN`, `INSTALL_MODE`, `SKIP_BACKUP`, mirrors into `~/.claude/skills`, `~/.codex/skills`, `~/.gemini/skills`, and `~/.opencode/skills`. | All |
| `deployment-automation` | Release-execution anchor for preview releases, staging/prod promotion, rollout strategy, post-deploy verification, rollback response, and release hardening; routes CI authoring to `workflow-automation`, machine setup to `system-environment-setup`, and Vercel-specific operations to `vercel-deploy` | All |
| `environment-setup` | App-config compatibility skill for `.env` layout, env precedence, validation, and secret handoff; routes broader runnable-machine setup to `system-environment-setup` | All |
| `firebase-ai-logic` | Direct Firebase app/client SDK lane for Gemini-powered features, streaming, structured output, and App Check-aware in-app integration; routes backend orchestration to `genkit` | Claude · Gemini |
| `firebase-cli` | Firebase platform/operator anchor for install/auth, bootstrap/config, Emulator Suite workflows, scoped deploy/release, App Hosting, and admin/data ops; routes backend AI workflow orchestration to `genkit` and direct app SDK integration to `firebase-ai-logic` | All |
| `genkit` | Packet-first backend AI workflow anchor for deciding whether a feature needs a reusable server-owned flow, Genkit eval/tracing, or a fallback to plain SDK routes / `survey`; routes direct app SDK work to `firebase-ai-logic` and Firebase operator tasks to `firebase-cli` | Claude · Gemini |
| `looker-studio-bigquery` | Packet-first BigQuery dashboard/reporting lane for `dashboard-spec`, `slow-dashboard`, `refresh-shape`, `audience-split`, and `exec-handoff`; routes KPI interpretation to `data-analysis` | All |
| `monitoring-observability` | Packet-first telemetry design/review for service health, telemetry rollout, alert/dashboard audits, pipeline trust, and live-ops visibility | All |
| `scrapling` | Routing-first adaptive web scraping: choose parser-only, HTTP fetch, JS browser, stealth escalation, MCP, or spiders from one intake packet | All |
| `rtk` | Rust Token Killer installation and agent setup - `rtk gain` verification, package-collision repair, agent-specific `rtk init`, and direct compact shell wrappers | All |
| `security-best-practices` | Routing-first web/application/API hardening that classifies the missing security layer (browser policy, cookies/CSRF, abuse, validation, secrets, verification) before recommending one bounded hardening brief | All |
| `strix` | Strix CLI for AI-driven application security testing - Docker preflight, LLM provider setup, local/GitHub/live target scans, scan modes, and CI/CD usage | All |
| `system-environment-setup` | Canonical broader environment-setup skill for runnable repos, toolchains, Docker/devcontainers, local services, onboarding, and setup drift diagnosis | All |
| `vercel-deploy` | Vercel-specific operator skill for linked-project preview/prod deploys, staged promote flows, aliases/domains, env-scope fixes, and rollback response | All |
| `zeude` | Enterprise AI adoption platform for Claude Code — 3× adoption improvement via OpenTelemetry measurement, centralized skill/MCP/hook sync (Zeude Shim), and context-aware skill suggestions. Requires Supabase + ClickHouse | Claude |
| `hyperfine-benchmarking` | Benchmark shell commands reliably with hyperfine — warmup runs, statistical summaries, parameter sweeps, export artifacts (JSON/CSV/Markdown), and regression detection | All |
| `lmstudio-cli` | Operate LM Studio's `lms` CLI and local/remote LM Studio servers — model discovery, server status, model loading, endpoint smoke tests, and OpenAI-compatible wiring | All |
| `typesense` | Stand up a self-hostable typo-tolerant search environment (open-source Algolia/ElasticSearch alternative, single C++ binary) — pick Docker / binary / Typesense Cloud, install a client, design a collection schema, index, and search with faceting, geo, sorting, synonyms, scoped API keys, federated multi-search, and vector/hybrid; wire an InstantSearch.js UI and a Raft HA cluster. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill typesense` | All |

### 📝 Documentation (6)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `changelog-maintenance` | Routing-first release-history anchor for changelogs, release notes, migration updates, and lightweight patch-note packets | All |
| `presentation-builder` | Packet-first deck artifact anchor for investor / roadmap / launch / architecture-demo / workshop / game-pitch decks, with honest last-mile handoff to HTML review, PPTX, PDF, Google Slides, or Figma Slides | All |
| `research-paper-writing` | ML/CV/NLP academic paper + rebuttal workflow — abstract/introduction/method/experiments, figure-table support, claim-evidence alignment, reviewer response, camera-ready revision | All |
| `slides-grab` | Generate, visually edit, and export beautiful HTML/CSS presentation decks with agents using slides-grab (NomaDamas, MIT) — the open-source Claude Design alternative and "best harness + editor + linter for generating slides in Claude Code / Codex". The skill plans (agent drafts a structured outline), designs (each slide is a self-contained `slide-XX.html`), edits (pure-JS browser editor where you drag a bbox over any region and ask the agent to rewrite just that area, or hand-edit text/size/bold), and exports (capture-or-print PDF, per-slide PNG incl. Instagram 1:1 card-news, plus experimental/unstable PPTX and Figma-importable PPTX). Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill slides-grab` | All |
| `technical-writing` | Internal technical docs anchor for specs, architecture docs, ADRs, runbooks, migration guides, and developer-facing implementation notes | All |
| `user-guide-writing` | Mode-selecting user-docs anchor for onboarding guides, tutorials, task how-to articles, FAQs, help-center updates, and release-facing help refresh packets | All |

### 📊 Project Management (4)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `sprint-retrospective` | Routing-first retrospective anchor for sprint retros, milestone postmortems, remote/hybrid facilitation, and dead-action-item recovery | All |
| `standup-meeting` | Routing-first coordination-cadence anchor for deciding whether daily, async, hybrid, lighter, or no recurring standup is justified before choosing a standup mode | All |
| `task-estimation` | Routing-first estimate packet anchor for story points, t-shirt sizing, split/spike guidance, and forecast-safe uncertainty framing across software, GTM, and game work | All |
| `task-planning` | Packet-first planning anchor for backlog cleanup, feature slicing, sprint/milestone prep, and release packets with explicit route-outs to estimation, boards, review, and pre-planning framing | All |

### 🔭 Search & Analysis (11)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `autoresearch` | Karpathy autonomous ML search front door — choose setup / `program.md` / bounded loop / results interpretation / constrained-hardware mode, preserve immutable `prepare.py` + 300s + `val_bpb`, route prompt/skill eval elsewhere | All |
| `skill-autoresearch` | Repo-local skill ratcheting loop: choose one packet (ratchet eligibility, readiness, charter, baseline, mutation, support-sync, final report), allow `no ratchet justified`, freeze evals, keep or revert by score, and route hosted eval / ML autoresearch work outward | All |
| `codebase-search` | Routing-first repo navigation: choose one search packet for definitions/references, config/content ownership, entry-point discovery, or impact mapping before debugging/refactoring | All |
| `data-analysis` | Decision-first dataset analysis for exports, experiments, telemetry, and KPI explanation | All |
| `langsmith` | Routing-first LangSmith skill: choose one packet for trace-debug, evals, review queues, prompt-registry decisions, or cross-service propagation before touching SDK code | All |
| `opik` | Open-source LLM observability, evaluation & optimization via Comet's Opik — server mode routing (cloud / `./opik.sh` Docker / Kubernetes), `@opik.track` tracing plus 50+ framework integrations, LLM-as-a-judge metrics, Datasets/Experiments with PyTest CI gates, production monitoring, Agent Optimizer, Guardrails. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill opik` | All |
| `log-analysis` | Routing-first log triage: choose one evidence packet for app, container/pod, browser+API, CI cascade, JSON/event, or security-signal logs before debugging/observability work | All |
| `pattern-detection` | Routing-first pattern/anomaly hunting: choose text-prefilter, structural-code-rule, log-event-pattern, or metric-anomaly before deeper analysis | All |
| `github-repo-candidate-quality-gate` | Convert noisy GitHub search results into recommendation-grade candidate lists — metadata freshness, license shape, activity signals, and dependency risk scoring | All |
| `semble` | Token-efficient code search for agents — returns only relevant code chunks using ~98% fewer tokens than grep+read. Natural-language and symbol queries, semantic `find-related`, MCP for Claude Code/Codex/Cursor/OpenCode, Python library, CPU-only with no API key | All |
| `codeflow` | Visualize codebase architecture in seconds — a zero-build single `index.html` browser app (React 18 + D3.js, client-side, no backend) that turns any GitHub repo, local folder, PR, or markdown/Obsidian vault into an interactive dependency graph with blast-radius, code ownership, heuristic security scan, pattern/anti-pattern detection, an A–F health score, activity heatmap, and PR impact; exports JSON/Markdown/SVG/PDF or a self-updating CodeFlow Card. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill codeflow` | All |

### 🎬 Creative Media (5)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `drawio` | Text-to-diagram and codebase-to-diagram via Agents365-ai/drawio-skill — editable `.drawio` exported to PNG/SVG/PDF/JPG through the native draw.io CLI, 6 presets (ERD/UML/sequence/architecture/ML-DL/flowchart), 10,000+ official AWS/Azure/GCP/Cisco/K8s/UML/BPMN shapes, 321 AI/LLM logos, vision self-check + 5-round refinement. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill drawio` | All |
| `remotion-video-production` | Compatibility alias for `video-production` when legacy tooling or explicit Remotion naming still expects the old skill | All |
| `video-production` | Canonical programmable-video / automated-video production skill for Remotion, template APIs, content repurposing, and QA handoffs | All |
| `god-tibo-imagen` | Generate AI images via Codex ChatGPT backend — zero dependencies, reuses `~/.codex/auth.json`, CLI (`gti`), Node.js, and Python SDK | All |
| `notebooklm` | Query Google NotebookLM notebooks directly from Claude Code — source-grounded citation-backed answers via Patchright browser automation, persistent Google auth, and notebook library management | Claude Code |

### 📢 Marketing (2)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `marketing-automation` | Canonical broad marketing front door — choose one operating mode, one primary lane, and one reusable operator packet with owner, dependencies/approvals, and proof across launch, conversion, lifecycle, acquisition/content, and measurement work | All |
| `marketing-skills-collection` | Compatibility alias for `marketing-automation` in legacy prompt packs and catalogs | All |

### 🎮 Game Development (6)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `game-build-log-triage` | Unity/Unreal build, cook, package, editor, signing, and CI log triage — isolate the first actionable engine/build failure | All |
| `game-ci-cd-pipeline` | Game pipeline packet router — classify branch-gate vs nightly/package-candidate vs release/certification lane, then choose setup, stage split, cache policy, preflight, artifact/release hygiene, or CI-signal hardening | All |
| `game-demo-feedback-triage` | Turn playtest/demo/community feedback into weighted themes, fix-first priorities, and explicit handoffs | All |
| `game-performance-profiler` | Unity/Unreal frame-time triage — bottleneck-first profiling brief, quick packets, benchmark routes, target-device review, and deliberate profiler escalation | All |
| `steam-store-launch-ops` | Packet-first Steam launch router — choose page-promise audit, wishlist signal check, demo readiness, event timing workback, or launch-ops runbook | All |
| `unity-gamedev-skill-pack` | Evaluate and adopt Unity game-development skill packs from external repositories into a safe, reusable local package with validation and integration guidance | All |

### 🔧 Utilities (14)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `fabric` | AI prompt patterns — YouTube summaries, document analysis via 200+ Patterns | All |
| `file-organization` | Decision-first repo structure skill — choose feature/shared/route/package boundaries, naming rules, and migration steps | All |
| `git-submodule` | Git submodule management | All |
| `git-workflow` | Local Git branch, commit, rebase, conflict, push-safety, and recovery workflows | All |
| `google-workspace` | Google Workspace REST API automation — Docs, Sheets, Slides, Drive, Gmail, Calendar, Chat, Forms, Admin SDK, Apps Script | All |
| `llm-wiki` | Persistent markdown wiki maintenance for Obsidian or git-tracked vaults — raw sources, source summaries, query filing, lint passes, and optional Scrapling/qmd helpers | All |
| `npm-git-install` | Routing-first Node package delivery skill for npm / pnpm / Yarn / Bun — choose temporary Git bridge, SHA pin, tarball, workspace, or publish-first handoff safely | All |
| `obsidian` | **Unified Obsidian skill (v2.0)** — plugin development (27 ESLint rules, boilerplate, submission) + CLI automation (commands, TUI, URI handoff, developer mode) + content patterns (markdown, Bases, JSON Canvas). Plugin: `claude plugin marketplace add akillness/jeo-skills` | All |
| `obsidian-cli` | *(alias → `obsidian`)* Route Obsidian desktop automation — official CLI, `obsidian://` handoff, developer commands | All |
| `obsidian-plugin` | *(alias → `obsidian`)* Obsidian plugin development — 27 ESLint rules, boilerplate generator, submission | All |
| `opencontext` | Routing-first active project/repo memory — choose memory-layer choice, load-context, search-context, store-conclusions, setup-integration, or repo-packer route-out for manifests, stable links, cross-agent handoff packets, and highest-confidence-source / freshness checks when notes overlap | All |
| `workflow-automation` | Routing-first repo workflow automation — choose one mode for task-entrypoints, bootstrap/onboarding, local-CI parity, hook guardrails, maintenance bots, or workflow cleanup without drifting into environment/deploy work | All |
| `claudekit` | Standardized Claude Code workflow toolkit — claudekit plugin installation, init, update, hook management, and workspace configuration for consistent Claude Code setups | All |
| `ghgrab` | Search and download specific files/folders from GitHub repositories directly from terminal using ghgrab, without full repo cloning | All |
| `obsidian-cli-uri-fallback` | Fallback handler for Obsidian URI automation in cron/headless environments — detects URI failure signatures and routes to filesystem or headless alternatives | All |

### 🛠 Utilities (Productivity) (6)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `ponytail` | Write the least code that fully solves the task — YAGNI ladder (skip → stdlib → native → installed dep → one line), `ponytail:` upgrade-path markers, `lite/full/ultra/off` intensity, and `/ponytail-review` / `-audit` / `-debt` commands. Never cuts validation, data-loss handling, security, or accessibility. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill ponytail` | All |
| `caveman` | Ultra-compressed communication mode (~75% token reduction). Activate: "caveman mode", "less tokens". Deactivate: "stop caveman" | All |
| `write-a-skill` | Create structured agent skills: gather requirements → draft SKILL.md → review. Description field is critical for agent activation | All |
| `git-guardrails-claude-code` | Prevent destructive git operations (force push, reset --hard, clean, branch -D) via Claude Code PreToolUse hooks | Claude |
| `setup-pre-commit` | Configure Husky + lint-staged + Prettier pre-commit hooks with typecheck and test automation | All |
| `scaffold-exercises` | Create educational exercise directories (XX-section/XX.YY-exercise/problem\|solution\|explainer) that pass pnpm ai-hero-cli lint | All |

---

## 🧬 TOON Format Injection

TOON (Token-Oriented Object Notation) compresses the skill catalog and auto-injects it into every prompt. **40-50% token savings** vs JSON/Markdown.

| Platform | File | Mechanism |
|----------|------|-----------|
| Claude Code | `~/.claude/hooks/toon-inject.mjs` | `UserPromptSubmit` hook — 26-37ms |
| Antigravity CLI (`agy`) | `~/.gemini/antigravity-cli/hooks/toon-skill-inject.sh` | lifecycle hook (`agy inspect` to verify) |
| Codex CLI | `~/.codex/skills-toon-catalog.toon` | Static catalog |

- **Tier 1** (always): Skill catalog index (~875-3,500 tokens) — names + descriptions + tags
- **Tier 2** (on-demand): Individual SKILL.toon content (~292 tokens/skill, max 3)

---

## 🔮 Featured Tools

### ooo — Spec-First Control Loop
> Keyword: `ooo` · `ouroboros` · `ooo interview` | Platforms: Claude · Codex · Gemini · OpenCode

Spec-first development front door: clarify ambiguous requests, freeze the contract, execute, and verify before claiming done. MCP server install: `claude mcp add ooo -s user -- ouroboros mcp`.

| Phase | Owner | Description |
|-------|-------|-------------|
| Clarify / Spec | `ooo interview` | Freeze acceptance criteria before execution |
| Plan / Review | `plannotator` + `bmad` | Shape and approve the plan without reopening settled work |
| Runtime handoff / Execute | `omc` / `omx` / `ohmg` | Keep runtime-native config and execution in the runtime skill |
| Verify / QA | `browser-harness` | Record CDP browser / QA evidence before claiming completion |
| Verify UI | `agentation` | Wait for explicit submit, then process UI feedback |
| Durable knowledge | `llm-wiki` + `graphify` | File significant findings into the wiki and graph |

### plannotator — Visual Plan Review
> Keyword: `plan` | [Docs](docs/plannotator/README.md) | [GitHub](https://github.com/backnotprop/plannotator)

Browser UI for annotating AI plans. Approve or send structured feedback in one click. Works with Claude Code, OpenCode, Gemini CLI, and Codex CLI.

```bash
bash scripts/install.sh --all
```

### ooo — Ouroboros Specification-First Development
> Keyword: `ooo`, `ouroboros`, `ooo ralph` | [Docs](docs/ooo/README.md) | [GitHub](https://github.com/Q00/ouroboros)

Socratic interview → immutable seed/spec → execute against the contract → verify before done → keep looping until completion is actually verified. Installable as a Claude Code plugin or via pip.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add Q00/ouroboros

# pip
pip install ouroboros-ai[all]

# Skill install (any platform)
npx skills add https://github.com/akillness/jeo-skills --skill ooo

# Usage
ouroboros init start "I want to build a task management CLI"
ouroboros run workflow seed.yaml
ouroboros run resume
ouroboros tui monitor
```

### god-tibo-imagen — AI Image Generation via Codex Backend
> Keyword: `god-tibo-imagen`, `gti`, `image generation`, `codex image` | [Docs](docs/god-tibo-imagen/README.md) | [GitHub](https://github.com/NomaDamas/god-tibo-imagen)

Zero-dependency image generation using Codex's ChatGPT backend. Reuses existing `~/.codex/auth.json` — no separate API key needed. Supports CLI (`gti`), Node.js library, and Python SDK with optional reference image inputs.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add NomaDamas/god-tibo-imagen

# npm install (CLI)
npm install -g god-tibo-imagen

# Python SDK
pip install god-tibo-imagen

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill god-tibo-imagen

# Usage
 --output ./icon.png
gti --prompt "make it round" --input ./ref.png --output ./out.png
```

### notebooklm — Google NotebookLM Integration for Claude Code
> Keyword: `notebooklm`, `notebook query`, `google notebooklm` | [Docs](docs/notebooklm/README.md) | [GitHub](https://github.com/PleasePrompto/notebooklm-skill)

Query your Google NotebookLM notebooks directly from Claude Code via Patchright browser automation. Get source-grounded, citation-backed answers from your uploaded documents without leaving the terminal. Supports persistent Google authentication, notebook library management, and multi-notebook research workflows. **Local Claude Code only** (web UI not supported).

```bash
# Plugin install (Claude Code)
claude plugin marketplace add PleasePrompto/notebooklm-skill

# Manual clone
git clone https://github.com/PleasePrompto/notebooklm-skill.git ~/.claude/skills/notebooklm

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill notebooklm

# First-time setup (opens Chrome for Google login)
python scripts/run.py auth_manager.py setup

# Add a notebook and ask a question
python scripts/run.py notebook_manager.py add --url "https://notebooklm.google.com/notebook/ID" --name "my-research"
python scripts/run.py ask_question.py --question "What are the key findings?"
```

### pretext — Fast Multiline Text Measurement & Layout
> Keyword: `pretext`, `text measurement`, `text layout`, `paragraph height` | [Docs](docs/pretext/README.md) | [GitHub](https://github.com/chenglou/pretext)

Pure JavaScript/TypeScript text measurement and layout without DOM reflow. Calculate paragraph heights, build manual line layouts, handle emoji/CJK/RTL, and render to DOM, Canvas, or SVG — all via pure arithmetic on cached font metrics.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add chenglou/pretext

# npm install
npm install @chenglou/pretext

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill pretext
```

### zeude — Enterprise AI Adoption Platform for Claude Code
> Keyword: `zeude`, `ai adoption`, `claude code adoption`, `enterprise claude` | [Docs](docs/zeude/README.md) | [GitHub](https://github.com/zep-us/zeude)

Enterprise platform that solves the Intention-Action Gap in Claude Code adoption. Delivers 3× adoption improvement via OpenTelemetry measurement, centralized skill/MCP/hook sync (Zeude Shim), and context-aware skill suggestions at prompt time. Requires Supabase + ClickHouse.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add zep-us/zeude

# Self-hosted setup
git clone https://github.com/zep-us/zeude.git
cd zeude && cp .env.example .env
# Configure Supabase and ClickHouse credentials

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill zeude

# Per-developer Shim install (using agent key from dashboard)
curl -fsSL https://raw.githubusercontent.com/zep-us/zeude/main/install.sh | bash -s -- --key <AGENT_KEY>
```

### compresso — Offline Batch Video & Image Compression
> Keyword: `compresso`, `compress video`, `compress image`, `batch compression` | [Docs](docs/compresso/README.md) | [GitHub](https://github.com/codeforreal1/compressO)

Free, open-source, fully offline desktop compression (Tauri + React). Batch compress videos and images, trim/split, convert formats, embed subtitles, and manage metadata — powered by FFmpeg, pngquant, jpegoptim, and gifski.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add codeforreal1/compressO

# macOS Homebrew
brew install --cask codeforreal1/tap/compresso

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill compresso
```

### stitch-skills — Agent Skills for Stitch MCP
> Keyword: `stitch`, `stitch-design`, `stitch-loop`, `enhance-prompt` | [Docs](docs/stitch-skills/README.md) | [GitHub](https://github.com/google-labs-code/stitch-skills)

AI-powered UI design generation, prompt refinement, and screen-to-code workflows via the Stitch MCP server. Generate high-fidelity screens, multi-page websites, DESIGN.md docs, React/shadcn-ui components, and Remotion walkthrough videos.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add google-labs-code/stitch-skills

# Skill install (any platform)
npx skills add google-labs-code/stitch-skills --skill stitch-design --global
npx skills add google-labs-code/stitch-skills --skill enhance-prompt --global

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill stitch-skills
```

### open-design — Local-First Design Artifact Generation
> Keyword: `open-design`, `local design tool`, `prototype generation` | [GitHub](https://github.com/nexu-io/open-design)

Open-source alternative to Anthropic's Claude Design. Generates web, mobile, and desktop prototypes, presentation decks, and media artifacts using locally-installed coding agents (Claude Code, Cursor, Gemini CLI, GitHub Copilot, etc.). Includes 72 built-in design systems, 5 visual directions, 93 media prompt templates, and multi-format export.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add nexu-io/open-design

# Clone and run locally
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill open-design
```

### flutter-bloc-clean-architecture-skill — Flutter BLoC + Clean Architecture
> Keyword: `flutter bloc`, `clean architecture`, `flutter-bloc-development` | [Docs](docs/flutter-bloc-clean-architecture-skill/README.md) | [GitHub](https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill)

Agentic Flutter skill package that enforces strict clean-layer boundaries and BLoC state management patterns. Useful for teams who want architecture-constrained AI codegen and reusable examples.

```bash
# Direct source install
npx skills add https://github.com/abdelhakrazi/flutter-bloc-clean-architecture-skill --skill flutter-bloc-development

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill flutter-bloc-clean-architecture-skill
```

### semble — Token-Efficient Code Search for Agents
> Keyword: `semble`, `code search`, `semble search`, `semantic code search` | [GitHub](https://github.com/MinishLab/semble)

Fast, accurate code search that returns only the relevant code snippets agents need — using ~98% fewer tokens than grep+read. Indexes any local or remote repo in ~250ms entirely on CPU (no GPU or API key). Supports natural-language and symbol queries, semantic similar-code discovery, and MCP integration for Claude Code, Codex, Cursor, and OpenCode.

```bash
# MCP install (Claude Code)
claude mcp add semble -s user -- uvx --from "semble[mcp]" semble

# CLI install
pip install semble          # pip
uv tool install semble      # uv

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill semble
```

### vibe-kanban — AI Agent Kanban Board
> Keyword: `kanbanview` | [Docs](docs/vibe-kanban/README.md) | [GitHub](https://github.com/BloopAI/vibe-kanban)

Coding-board control plane for bounded coding cards: keep GitHub Projects / Linear / Jira as the PM source of truth when needed, run isolated workspaces or worktrees for actual coding execution, keep human review explicit, and hand off cleanly to PRs.

```bash
npx vibe-kanban
```

---

## 🌐 Recommended Harness OSS

| Repository | Stars | Description |
|-----------|------:|-------------|
| [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | 182k | Accessible AI platform for continuous agents |
| [AutoGen](https://github.com/microsoft/autogen) | 55.4k | Microsoft multi-agent conversation framework |
| [CrewAI](https://github.com/crewAIInc/crewAI) | 45.7k | Role-playing autonomous AI agent orchestration |
| [smolagents](https://github.com/huggingface/smolagents) | 25.9k | HuggingFace code-thinking agent library |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | 21.2k | 61 specialized AI agents across 9 divisions |
| [revfactory/harness](https://github.com/revfactory/harness) | meta-skill | Agent team & skill architect plugin / scaffold |

> Install & integration notes → [docs/harness/README.md](docs/harness/README.md) · packaged skill → [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md)

---

## 📁 Structure

```text
.
├── .agent-skills/          ← 142 skill folders (each with SKILL.md + SKILL.toon)
├── docs/                   ← detailed guides (bmad, omc, plannotator, ooo, ...)
├── install.sh
├── setup-all-skills-prompt.md
├── README.md               ← English (this file)
└── README.ko.md            ← 한국어
```

---

## 📖 Related Docs

| Tool | Keyword | Doc |
|------|---------|-----|
| `ooo` | `ooo`, `ouroboros`, `ooo interview` | [.agent-skills/ooo/SKILL.md](.agent-skills/ooo/SKILL.md) |
| `plannotator` | `plan` | [docs/plannotator/README.md](docs/plannotator/README.md) |
| `vibe-kanban` | `kanbanview` | [docs/vibe-kanban/README.md](docs/vibe-kanban/README.md) |
| `flutter-bloc-clean-architecture-skill` | `flutter bloc`, `clean architecture` | [docs/flutter-bloc-clean-architecture-skill/README.md](docs/flutter-bloc-clean-architecture-skill/README.md) |
| `ooo` | `ooo`, `ouroboros` | [docs/ooo/README.md](docs/ooo/README.md) |
| `stitch-skills` | `stitch`, `stitch-design`, `enhance-prompt` | [docs/stitch-skills/README.md](docs/stitch-skills/README.md) |
| `compresso` | `compresso`, `compress video`, `batch compression` | [docs/compresso/README.md](docs/compresso/README.md) |
| `open-design` | `open-design`, `local design tool`, `prototype generation` | [.agent-skills/open-design/SKILL.md](.agent-skills/open-design/SKILL.md) |
| `codeflow` | `codeflow`, `visualize codebase`, `dependency graph` | [.agent-skills/codeflow/SKILL.md](.agent-skills/codeflow/SKILL.md) |
| `slides-grab` | `slides-grab`, `slides grab`, `generate slides` | [.agent-skills/slides-grab/SKILL.md](.agent-skills/slides-grab/SKILL.md) |
| `browser-harness` | `browser-harness`, `self-healing browser`, `llm browser automation` | [.agent-skills/browser-harness/SKILL.md](.agent-skills/browser-harness/SKILL.md) |
| `pretext` | `pretext`, `text measurement`, `text layout` | [docs/pretext/README.md](docs/pretext/README.md) |
| `god-tibo-imagen` | `god-tibo-imagen`, `gti`, `image generation` | [docs/god-tibo-imagen/README.md](docs/god-tibo-imagen/README.md) |
| `notebooklm` | `notebooklm`, `notebook query`, `google notebooklm` | [docs/notebooklm/README.md](docs/notebooklm/README.md) |
| `zeude` | `zeude`, `ai adoption`, `enterprise claude` | [docs/zeude/README.md](docs/zeude/README.md) |
| `harness` | `harness` | [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md) |
| `omc` | `omc` | [docs/omc/README.md](docs/omc/README.md) |
| `bmad` | `bmad` | [docs/bmad/README.md](docs/bmad/README.md) |
| Harness OSS | — | [docs/harness/README.md](docs/harness/README.md) |

---

## 📎 References

| Component | Source | License |
|-----------|--------|---------|
| `omc` | [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | MIT |
| `ooo` | [Q00/ouroboros v0.29.0](https://github.com/Q00/ouroboros/tree/v0.29.0) | MIT |
| `stitch-skills` | [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) | Apache-2.0 |
| `compresso` | [codeforreal1/compressO](https://github.com/codeforreal1/compressO) | AGPL-3.0 |
| `open-design` | [nexu-io/open-design](https://github.com/nexu-io/open-design) | MIT |
| `pretext` | [chenglou/pretext](https://github.com/chenglou/pretext) | MIT |
| `god-tibo-imagen` | [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen) | MIT |
| `notebooklm` | [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill) | MIT |
| `zeude` | [zep-us/zeude](https://github.com/zep-us/zeude) | Apache-2.0 |
| `flutter-bloc-clean-architecture-skill` | [AbdelhakRazi/flutter-bloc-clean-architecture-skill](https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill) | Apache-2.0 |
| `plannotator` | [plannotator.ai](https://plannotator.ai) | MIT |
| `bmad` | [bmad-dev/BMAD-METHOD](https://github.com/bmad-dev/BMAD-METHOD) | MIT |
| `agentation` | [benjitaylor/agentation](https://github.com/benjitaylor/agentation) | MIT |
| `fabric` | [danielmiessler/fabric](https://github.com/danielmiessler/fabric) | MIT |
| `harness` | [revfactory/harness](https://github.com/revfactory/harness) | Apache-2.0 |
| `obsidian-cli` | [Obsidian CLI Help](https://obsidian.md/help/cli) | Proprietary |
| `llm-wiki` | [karpathy/llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | — |
| `graphify` | [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT |
| `browser-harness` | [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | MIT |
| `scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| `semble` | [MinishLab/semble](https://github.com/MinishLab/semble) | MIT |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 |
| `autoresearch` | Andrej Karpathy methodology | — |
| `research-paper-writing` | [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | — |
| Agent Skills Spec | [agentskills.io](https://agentskills.io/specification) | — |

---

<div align="center">

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/akillness3q)

⭐ If this helps you, star the repository!

```bash
gh api --silent --method PUT /user/starred/akillness/jeo-skills >/dev/null 2>&1 || true
```

</div>
