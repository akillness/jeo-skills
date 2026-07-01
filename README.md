# Agent Skills

<div align="center">

[![Skills](https://img.shields.io/badge/Skills-145-blue?style=for-the-badge)](https://github.com/akillness/jeo-skills)

[![Platform](https://img.shields.io/badge/Platform-Claude%20%7C%20Gemini%20%7C%20Codex%20%7C%20OpenCode-orange?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![BMAD](https://img.shields.io/badge/BMAD-1.2.0-purple?style=for-the-badge)](docs/bmad/README.md)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

**145 local skill folders · 145 installable skills · TOON Format · Cross-platform**

[Quick Start](#-quick-start) · [Skills List](#-skills-list) · [Installation](#-installation) · [한국어](README.ko.md)

</div>

---

## 💡 What is Agent Skills?

A curated collection of 145 agent skills for spec-first, multi-agent LLM workflows — Claude, Gemini, Codex, Cursor, and OpenCode.

<!-- WHATS-NEW:START -->
## 🆕 What's New in v2026-06-29

| Change | Details |
|--------|----------|
| **paperbanana: routing-first academic illustration** | Added `paperbanana` — a routing front door for [llmsresearch/paperbanana](https://github.com/llmsresearch/paperbanana) (MIT), an agentic framework that turns text or a paper into publication-quality figures with a **two-phase, plan-then-refine, multi-agent pipeline** (Phase 0 input optimization → Phase 1 Retriever/Planner/Stylist → Phase 2 Visualizer/Critic loop). The skill routes each request to the **smallest workable mode**: `plot` (VLM-only statistical charts, no image-gen key) < `generate` (one methodology diagram) < `batch`/`plot-batch`/`sweep`/`orchestrate` (many figures / full-paper package), with `evaluate` (VLM-as-Judge on Faithfulness/Readability/Conciseness/Aesthetics) and `polish` (guided edit) to fix figures before regenerating. Provider-agnostic (OpenAI/Azure/Gemini/Atlas/OpenRouter); venue style packs (neurips/icml/acl/ieee). Ships `SKILL.md` + `SKILL.toon`, 5 reference docs (`intake-and-route-outs.md`, `pipeline-and-agents.md`, `modes-and-cli.md`, `providers-and-config.md`, `evaluation-and-venues.md`), `scripts/install.sh` + `run.sh` + `run-mcp.sh`, and `evals/evals.json`. Route-outs: matplotlib/TikZ/vector editors for exact or trivial figures. 144 → **145 skills**. |
| **webtoon-harness: 27-agent webtoon production team** | Added `webtoon-harness` — a jeo-skills plugin packaging [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) (MIT), a Claude Code harness that builds **one webtoon episode end to end** with **27 specialized agents in 4 phase-rebuilt teams** (research → scenario → visual → assembly). It researches popular webtoon trends, writes a dialogue-heavy, high-tension, twist-every-episode scenario, renders character reference sheets **first** (the cross-episode consistency SSOT), batch-renders **50+ panels** per episode with **in-image Korean speech-bubble baking** via `codex-image` (≤5 concurrent codex sessions), runs a **6-axis validate–regenerate loop** until every panel passes, and assembles a **no-overlay vertical-scroll viewer**. Phase-0 follow-up routing handles "next episode", "stronger twist", and "redraw panel N". The Phase-2 trend-research web extraction routes through the **`scrapling`** skill (pick the lightest workable scraping mode; respect ToS/robots/rate-limits/copyright; source URL + observation date per claim). Ships `SKILL.md` + `SKILL.toon`, 4 reference docs (`agent-teams.md`, `workflow.md`, `trend-research-scrapling.md`, `install.md`), `scripts/install.sh` (`TARGET` / `GLOBAL` / `REF` knobs that scaffold the upstream `.claude/agents` + `.claude/skills` into a project), and `evals/evals.json`. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill webtoon-harness`. Route-outs: `scrapling` (web extraction), `harness` (evolve the agent team & skills). 143 → **144 skills**. |
| **obsidian removed** | Removed the unified `obsidian` skill folder and its catalog/README/install-prompt entries (`obsidian`, `obsidian-cli`, `obsidian-cli-uri-fallback`, `obsidian-plugin`); `obsidian-second-brain` is retained as the canonical Obsidian front door. Catalog surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`) updated. 144 → **143 skills**. |
| **perfectpixel: AI animation sprite generation** | Added `perfectpixel` — a jeo-skills routing front door for [gykim80/perfectpixel-studio](https://github.com/gykim80/perfectpixel-studio) (MIT) that drives the installed desktop app's generation pipeline (prompt → AI image gen → background matting → frame extraction → quality check → corrective regeneration → pixel quantization) headlessly through the `ppgen` CLI. From one text description it builds a character plus animation states (100+ presets across idle/locomotion, combat, magic, damage, emotion, and interaction) and 8-direction sprite sets (5 AI-generated + 3 horizontally mirrored), then exports a game-engine-ready bundle (sprite sheet · `manifest.json` · Aseprite JSON · per-state GIF/APNG · individual frame PNGs). Supports four image backends — Gemini (`gemini-3-pro-image`), OpenRouter, fal.ai, BytePlus — plus `god-tibo-imagen` (Codex/ChatGPT backend via `~/.codex/auth.json`, no API key); resolves provider/keys via `config.json` → `.env`/`.env.local` → OS env → CLI flags. Ships `SKILL.md` + `SKILL.toon`, 2 reference docs (`presets.md`, `providers.md`), and `scripts/install.sh` (reuse-or-download prebuilt binary, else Go source build via `PERFECTPIXEL_SRC`/bundled `.src`/clone; `PP_VERSION` / `PP_BUILD` knobs). Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill perfectpixel`. Route-outs: `bmad-gds` (game production orchestration), `unity-gamedev-skill-pack` (engine integration), `compresso` (asset compression). 143 → **144 skills**. |


## 🆕 What's New in v2026-06-26

| Change | Details |
|--------|----------|
| **open-code-review: AI code review via the `ocr` CLI** | Added `open-code-review` — a routing-first operator front door for Alibaba's [open-code-review](https://github.com/alibaba/open-code-review) (`ocr`), an open-source AI code-review CLI that reads Git diffs (or whole files) and emits structured, line-level review comments through a configured LLM. The skill confirms prerequisites (`ocr llm test` + provider config without ever hardcoding API keys), distills `--background` business context, then picks the lightest invocation — workspace review, single commit, `--from/--to` branch range, or full-file `ocr scan` with `--preview`/`--max-tokens-budget` cost control — classifies findings into High/Medium/Low, and auto-fixes only safe High/Medium items on explicit intent. Ships `SKILL.md` + `SKILL.toon`, 3 reference docs (`intake-and-modes.md`, `configuration-and-rules.md`, `cicd-and-plugins.md`), `scripts/install.sh` (`npm` / `release` / `source` methods), `scripts/run-review.sh`, `scripts/run-scan.sh`, and `evals/evals.json`. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill open-code-review` (upstream: `/plugin marketplace add alibaba/open-code-review`, `codex plugin marketplace add alibaba/open-code-review`). Route-outs: `code-review` (human approve/block judgment), `git-workflow` (Git mechanics), `debugging` (live-failure reproduction). 140 → **141 skills**. |
| **awesome-agent-skills removed** | Removed `awesome-agent-skills` (added 06-24) from the catalog. The Shubhamsaboo/awesome-llm-apps routing front door is no longer shipped as a bundled skill; its 18 expert personas remain available upstream via `npx skills add shubhamsaboo/awesome-agent-skills`. Catalog surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`) updated. 139 → **138 skills**. |
| **obsidian-second-brain: a self-rewriting Obsidian vault** | Added `obsidian-second-brain` — a jeo-skills routing front door for [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain) (origin [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain), MIT), an evolution of [Karpathy's LLM-Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) into **a vault that rewrites itself**: every source REWRITES existing pages instead of appending (people updated, claims revised, contradictions reconciled, cross-source patterns synthesized automatically). One skill maps **45 commands across 4 layers** — Operations (28: save/ingest/synthesize/reconcile/export/daily/calendar/architect/…), Thinking Tools (7: challenge/panel/emerge/connect/…), Context Engine (1: world), Research Toolkit (7: x-read/x-pulse/research/research-deep/notebooklm/youtube/podcast) — plus a background agent + 4 scheduled agents (morning/nightly/weekly/health), 4 role presets (executive/builder/creator/researcher), and a write-time AI-first vault validator. Cross-CLI: Claude Code, Codex CLI, Gemini CLI, OpenCode (incl. open models like Hermes). `/research` + `/research-deep` work key-less. Ships `SKILL.md` + `SKILL.toon`, 3 reference docs (`commands.md`, `install.md`, `vault-architecture.md`), and `scripts/install.sh` (`GLOBAL` / `WITH_UPSTREAM` / `VAULT` / `AGENTS` knobs). Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill obsidian-second-brain`. Route-outs: `obsidian` (plugin/CLI/URI automation), `llm-wiki` (raw markdown wiki layer), `okf` (portable knowledge bundles), `notebooklm` (source-grounded queries), `scrapling` (web extraction). 138 → **139 skills**. |
| **devup-ui: zero-runtime CSS-in-JS adoption** | Added `devup-ui` — a jeo-skills routing front door for [dev-five-git/devup-ui](https://github.com/dev-five-git/devup-ui) (Apache-2.0, [docs](https://devup-ui.com)), a **zero-runtime CSS-in-JS** library whose Rust + WebAssembly preprocessor extracts every style at build time (Zero Config · Zero FOUC · Zero Runtime · full CSS-in-JS syntax coverage). The skill routes adoption: pick the build-time bundler plugin first (`@devup-ui/next-plugin` / `vite-plugin` / `rsbuild-plugin` / `webpack-plugin` / `bun-plugin`), style with `Box`/`css` props or the styled-components-compatible `styled()` API (4px spacing scale, responsive arrays, `_hover` pseudo selectors, dynamic values → CSS variables), set up type-safe `devup.json` theming with zero-cost theme switching, ship React Server Components without a client Provider, and migrate off styled-components / Emotion / Tailwind / Panda / vanilla-extract. Ships `SKILL.md` + `SKILL.toon`, 3 reference docs (`installation-and-plugins.md`, `styling-api.md`, `theming-and-migration.md`), and `scripts/install.sh` (`GLOBAL` / `BUNDLER` / `PROJECT` / `PKG_MANAGER` / `AGENTS` knobs). Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill devup-ui`. Route-outs: `design-system` (token governance), `ui-component-patterns` (component API/anatomy), `responsive-design` (layout strategy), `web-accessibility` (a11y), `react-best-practices` (bundle/RSC/rerender perf). 139 → **140 skills**. |
| **graphify: durable wikilink-normalization patch** | Fixed graphify's wiki generator at the source. graphify (PyPI `graphifyy`) saves community / god-node pages under a *slugged* filename (`Community 36` → `Community_36.md`) but emits *raw-label* wikilinks (`[[Community 36]]`) that never resolve — 691 broken links in one vault, and regex-fixing the generated files doesn't survive a rebuild. Added `.agent-skills/graphify/scripts/patch_wikilink.py`: an idempotent, self-testing patcher that rewrites every raw-label link site in `site-packages/graphify/wiki.py` to `[[slug|label]]` via a `_wikilink` helper. Since `pip install --upgrade graphifyy` wipes the in-place edit, the skill now documents wiring the patcher into config so it self-heals (jeo: `post-implementation` hook ahead of `graphify update .`). New `wikilink-normalization-patch` recipe in `references/build-and-fallback-recipes.md`, best-practice + reference in `SKILL.md`, extra `SKILL.toon` rule; `graphify` `2.0.0` → `2.1.0`. Permanent fix tracked upstream (`safishamsi/graphify`). |

## 🆕 What's New in v2026-06-24

| Change | Details |
|--------|----------|
| **deep-research: structured, parallel deep-research workflow** | Added `deep-research` — a jeo-skills routing front door for [Weizhena/Deep-Research-skills](https://github.com/Weizhena/Deep-Research-skills) (inspired by RhinoInsight, arXiv:2511.18743). One skill, **4 reference pipelines**: **outline** (`/research` · `/research-add-items` · `/research-add-fields` → extensible `outline.yaml` + `fields.yaml`), **deep** (`/research-deep` → parallel per-item web-search agents writing validated JSON, gated by `validate_json.py` field-coverage), **report** (`/research-report` → TOC with anchor links + per-field-category `report.md`), and **web-search** (the research agent + 5 routed source modules: github-debug, general-web, academic-papers, chinese-tech, stackoverflow). Human-in-the-loop at every stage (items, fields, time range, batch size, TOC fields); verbatim prompt-template contract; evidence-first with `[uncertain]` marking — never fabricates values. Ships 4 reference docs, `SKILL.toon`, `scripts/validate_json.py`, and `scripts/install.sh` (`GLOBAL` / `WITH_DEPS` / `WITH_UPSTREAM` / `AGENTS` knobs). Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill deep-research`. Route-outs: `academic-research` (citation-gated publication pipeline), `autoresearch` (ML experiment search), `semble` (repo code search). 138 → **139 skills**. |
| **awesome-agent-skills: 18 expert personas in one router** | Added `awesome-agent-skills` — a jeo-skills routing front door for the [Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/awesome_agent_skills) Awesome Agent Skills collection. One skill, **6 reference pipelines**, 18 expert-persona skills + a self-improving optimizer: **coding** (python-expert, debugger, fullstack-developer), **research** (deep-research, fact-checker, academic-researcher), **writing** (technical-writer, content-creator, editor, email-drafter, meeting-notes), **planning** (project-planner, sprint-planner, strategy-advisor, decision-helper, ux-designer), **data** (data-analyst, visualization-expert), and **self-improving** (Google ADK Executor+Analyst+Mutator skill-optimization loop). Routes each request to the right pipeline + persona, then executes with that persona's framework and output format; integrity guardrails (no fabricated citations, justify every finding, persona fidelity, human-in-the-loop for high-stakes calls). Ships 6 reference docs, `SKILL.toon`, and `scripts/install.sh` (`GLOBAL` / `WITH_UPSTREAM` / `AGENTS` knobs). Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill awesome-agent-skills` (upstream full collection: `npx skills add shubhamsaboo/awesome-agent-skills`). Route-outs: `academic-research` (citation-gated publication pipeline), `omc`/`omx`/`ohmg` (multi-agent orchestration), `semble` (repo code search), `code-refactoring`, `marketing-automation`, `drawio`/`slides-grab`. 137 → **138 skills**. |

## 🆕 What's New in v2026-06-23

| Change | Details |
|--------|----------|
| **academic-research: full research-to-publication pipeline** | Added `academic-research` — a jeo-skills routing wrapper for the [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) ARS suite (v3.13.0). Single skill, 4 reference pipelines, 27 modes, 39-agent ensemble: `deep-research` (8 modes incl. PRISMA, socratic, 3W-scan, fact-check), `academic-paper` (11 modes incl. plan, revision, citation-check, disclosure, rebuttal-audit), `academic-paper-reviewer` (6 modes incl. EIC+R1/R2/R3+Devil's Advocate, calibration), and `academic-pipeline` (10-stage end-to-end orchestrator with Material Passport, L3 claim-faithfulness gates, three-index citation triangulation, cross-model verification). Human-in-the-loop throughout with mandatory `[USER CHECKPOINT]` gates. 4 reference docs included. Plugin: `claude plugin marketplace add Imbad0202/academic-research-skills`. 136 → **137 skills**. |

> 📜 Older entries: [`changelog/en/`](changelog/en/) (monthly files, newest first).

<!-- WHATS-NEW:END -->

---

## 📦 Installation

> **Cross-platform**: macOS, Linux, and Windows (Git Bash / WSL2) are all supported. The LLM installer auto-detects your OS and picks the right package manager (`brew` / `snap` / `winget`) and paths (`$HOME` / `$USERPROFILE` / `$XDG_DATA_HOME`) for each tool.

### ✨ Recommended: LLM-driven install (one prompt, all platforms)

Hand the setup prompt to your coding agent (Claude Code, Codex, Gemini CLI, …). It reads the guide, detects your OS, installs the `skills` CLI, adds every skill into the correct per-agent paths, and registers the MCP/shell tools — no manual steps.

```bash
# Fetch the delegation guide and hand it to your agent
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

Or just paste the URL into the agent chat:

> Read `https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md` in full and follow it to install the jeo-skills.

The agent runs a **full install by default** (say "core only" or "minimal" to narrow it) and will:

- detect macOS / Linux / Windows and select `brew` / `snap` / `winget` + the right install paths,
- install the `skills` CLI and add skills with correct `-a` agent targeting (no duplicate platform exposure),
- register MCP tools (`ooo`, `semble`), shell tooling (`rtk`), and the `oh-my-claudecode` plugin,
- **preserve any pre-existing skills** — it only adds or updates, never deletes.

---

### Manual install (advanced / CI / no-agent)

For scripted or CI environments where no agent is in the loop, run the steps yourself.

#### Step 0: Install `skills` CLI

```bash
npm install -g skills
skills --version
```

#### Scope and paths

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

#### Choose by platform

```bash
# Claude Code
npx skills add https://github.com/akillness/jeo-skills \
  --skill omc --skill plannotator --skill agentation \
  --skill ooo --skill vibe-kanban

# Gemini CLI
npx skills add https://github.com/akillness/jeo-skills \
  --skill ohmg --skill ooo --skill vibe-kanban
antigravity extensions install https://github.com/akillness/jeo-skills

# Codex CLI
npx skills add https://github.com/akillness/jeo-skills \
  --skill omx --skill ooo
```

#### Core tool setup (all platforms)

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

> Full manifest: `.agent-skills/skills.json` · each folder's `SKILL.md` · 145 local skill folders = 145 total installable skills

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

### 🤖 Agent Development (7)

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

### 🎨 Frontend (13)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `design-system` | Canonical frontend UI-system anchor for token governance, visual-language rules, primitive naming, and cross-surface system direction; routes component API, responsive layout, accessibility remediation, and broad UI critique to adjacent skills | All |
| `devup-ui` | Zero-runtime CSS-in-JS adoption — wire the build-time Rust/WASM plugin into Next.js/Vite/Rsbuild/Webpack/Bun, style with `Box`/`css` props or the styled-components-compatible `styled()` API, type-safe `devup.json` theming, and migration off styled-components/Emotion/Tailwind. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill devup-ui` | All |

| `stitch-skills` | Agent Skills for Stitch MCP — generate high-fidelity UI screens, multi-page websites, DESIGN.md docs, enhance prompts, convert to React/shadcn-ui, Remotion walkthrough videos. Plugin: `claude plugin marketplace add google-labs-code/stitch-skills` | All |
| `compresso` | Free offline desktop video/image compression (Tauri+React) — batch compress, trim/split videos, convert formats, embed subtitles, manage metadata. Uses FFmpeg/pngquant/jpegoptim/gifski. Plugin: `claude plugin marketplace add codeforreal1/compressO` | All |
| `open-design` | Local-first open-source design tool — generate prototypes, decks, and media artifacts using installed coding agents. 72 built-in design systems, 5 visual directions, multi-format export (HTML/PDF/PPTX/ZIP). Plugin: `claude plugin marketplace add nexu-io/open-design` | All |
| `pretext` | Fast, accurate multiline text measurement & layout without DOM reflow — `prepare`/`layout` for height, `prepareWithSegments`/`layoutWithLines` for per-line access, emoji/CJK/RTL support, DOM/Canvas/SVG output. npm: `@chenglou/pretext` | All |
| `react-best-practices` | Measurement-led React & Next.js performance audits for waterfalls, bundle size, RSC/client boundaries, hydration, rerender churn, and slow routes | All |
| `react-grab` | Browser element context capture — point at UI element, copy React component name, file path, HTML to clipboard for AI agents | All |

| `responsive-design` | Routing-first responsive layout strategy for page-shell, component-slot, dense-data, media, and reflow-verification packets | All |
| `state-management` | React/fullstack ownership-packet decisions across local, Context, URL/form, client-store, and server-state/router data layers | All |
| `ui-component-patterns` | Routing-first reusable-component architecture for primitive-boundary, slot-anatomy, controlled-ownership, alternate-root, and docs-verification packets | All |
| `web-accessibility` | Routing-first accessibility remediation and verification for semantics, keyboard/focus, labels/announcements, reflow, media alternatives, and routed-app feedback | All |
| `web-design-guidelines` | Broad web UI audit for hierarchy, clarity, consistency, states, responsiveness basics, and accessibility basics | All |

### 🔍 Code Quality (11)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `agentic-skills` | Production-grade engineering framework (Google practices) — spec-driven development, incremental implementation, TDD, security hardening, performance optimization, and disciplined git/CI/CD workflows across `/spec` `/plan` `/build` `/test` `/review` `/code-simplify` `/ship` phases. Plugin: `/plugin marketplace add addyosmani/agent-skills` | All |
| `code-refactoring` | Behavior-preserving structural cleanup, decomposition, duplication removal, and codemod planning | All |
| `code-review` | Evidence-first diff / PR review with severity, missing-proof checks, and route-outs | All |
| `open-code-review` | Routing-first AI review via Alibaba's `ocr` CLI — confirm prereqs/LLM config, pass `--background` context, pick workspace / commit / branch-range / full-file `scan`, classify findings High/Medium/Low, and auto-fix safe items on intent; routes human approve/block judgment to `code-review`. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill open-code-review` | All |
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

### 🔭 Search & Analysis (13)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `autoresearch` | Karpathy autonomous ML search front door — choose setup / `program.md` / bounded loop / results interpretation / constrained-hardware mode, preserve immutable `prepare.py` + 300s + `val_bpb`, route prompt/skill eval elsewhere | All |
| `deep-research` | Routing front door for a structured, human-in-the-loop deep-research workflow ([Weizhena/Deep-Research-skills](https://github.com/Weizhena/Deep-Research-skills)) — turn a topic into an extensible outline, fan out parallel web-search agents to investigate each item into validated JSON, then render a complete markdown report. One skill, 4 reference pipelines (outline · deep · report · web-search) + 5 routed source modules. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill deep-research` | All |
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
| `academic-research` | Full academic research pipeline from discovery to publication — 4 reference pipelines, 27 modes, 39-agent ensemble: deep-research (8 modes: full/quick/review/lit-review/three-way-scan/fact-check/socratic/systematic-review), academic-paper (11 modes: full/plan/outline/revision/revision-coach/abstract/format-convert/citation-check/disclosure/rebuttal-audit), academic-paper-reviewer (6 modes: full/quick/guided/methodology-focus/re-review/calibration), and a 10-stage end-to-end pipeline orchestrator with Material Passport, claim-faithfulness gates, and cross-model verification. Human-in-the-loop throughout. Plugin (upstream): `claude plugin marketplace add Imbad0202/academic-research-skills` | All |

### 🎬 Creative Media (7)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `drawio` | Text-to-diagram and codebase-to-diagram via Agents365-ai/drawio-skill — editable `.drawio` exported to PNG/SVG/PDF/JPG through the native draw.io CLI, 6 presets (ERD/UML/sequence/architecture/ML-DL/flowchart), 10,000+ official AWS/Azure/GCP/Cisco/K8s/UML/BPMN shapes, 321 AI/LLM logos, vision self-check + 5-round refinement. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill drawio` | All |
| `remotion-video-production` | Compatibility alias for `video-production` when legacy tooling or explicit Remotion naming still expects the old skill | All |
| `video-production` | Canonical programmable-video / automated-video production skill for Remotion, template APIs, content repurposing, and QA handoffs | All |
| `god-tibo-imagen` | Generate AI images via Codex ChatGPT backend — zero dependencies, reuses `~/.codex/auth.json`, CLI (`gti`), Node.js, and Python SDK | All |
| `notebooklm` | Query Google NotebookLM notebooks directly from Claude Code — source-grounded citation-backed answers via Patchright browser automation, persistent Google auth, and notebook library management | Claude Code |
| `webtoon-harness` | End-to-end webtoon production harness packaging [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) (MIT) — 27 agents in 4 phase-rebuilt teams take one episode from trend research to a finished vertical-scroll viewer: dialogue-heavy twist-every-episode scenario, reference sheets first, 50+ panels rendered with in-image Korean speech-bubble baking via codex-image, a 6-axis validate–regenerate loop, then no-overlay assembly. Phase-2 trend research routes web extraction through the `scrapling` skill. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill webtoon-harness` | Claude Code |
| `paperbanana` | Routing-first academic illustration packaging [llmsresearch/paperbanana](https://github.com/llmsresearch/paperbanana) (MIT) — turns text or a paper into publication-quality figures via a two-phase plan-then-refine multi-agent pipeline (Retriever/Planner/Stylist → Visualizer/Critic). Routes to the smallest workable mode: `plot` (VLM-only charts) < `generate` (one diagram) < `batch`/`sweep`/`orchestrate`, with `evaluate` (VLM-as-Judge) and `polish` to fix figures before regenerating. Provider-agnostic; venue style packs (neurips/icml/acl/ieee). Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill paperbanana` | All |

### 📢 Marketing (1)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `marketing-automation` | Canonical broad marketing front door — choose one operating mode, one primary lane, and one reusable operator packet with owner, dependencies/approvals, and proof across launch, conversion, lifecycle, acquisition/content, and measurement work | All |

### 🎮 Game Development (7)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `game-build-log-triage` | Unity/Unreal build, cook, package, editor, signing, and CI log triage — isolate the first actionable engine/build failure | All |
| `game-ci-cd-pipeline` | Game pipeline packet router — classify branch-gate vs nightly/package-candidate vs release/certification lane, then choose setup, stage split, cache policy, preflight, artifact/release hygiene, or CI-signal hardening | All |
| `game-demo-feedback-triage` | Turn playtest/demo/community feedback into weighted themes, fix-first priorities, and explicit handoffs | All |
| `game-performance-profiler` | Unity/Unreal frame-time triage — bottleneck-first profiling brief, quick packets, benchmark routes, target-device review, and deliberate profiler escalation | All |
| `perfectpixel` | AI animation sprite generation studio — generate character animations, sprite sheets, and 8-direction sprite sets from a text description using god-tibo-imagen and gemini models | All |
| `steam-store-launch-ops` | Packet-first Steam launch router — choose page-promise audit, wishlist signal check, demo readiness, event timing workback, or launch-ops runbook | All |
| `unity-gamedev-skill-pack` | Evaluate and adopt Unity game-development skill packs from external repositories into a safe, reusable local package with validation and integration guidance | All |

### 🔧 Utilities (13)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `fabric` | AI prompt patterns — YouTube summaries, document analysis via 200+ Patterns | All |
| `file-organization` | Decision-first repo structure skill — choose feature/shared/route/package boundaries, naming rules, and migration steps | All |
| `git-submodule` | Git submodule management | All |
| `git-workflow` | Local Git branch, commit, rebase, conflict, push-safety, and recovery workflows | All |
| `google-workspace` | Google Workspace REST API automation — Docs, Sheets, Slides, Drive, Gmail, Calendar, Chat, Forms, Admin SDK, Apps Script | All |
| `llm-wiki` | Persistent markdown wiki maintenance for Obsidian or git-tracked vaults — raw sources, source summaries, query filing, lint passes, and optional Scrapling/qmd helpers | All |
| `okf` | Create, validate, and consume Google's Open Knowledge Format (OKF) bundles — YAML-frontmatter Markdown files (type/title/description/resource/tags/timestamp) for portable, interoperable AI-agent knowledge sharing. Formalizes the LLM-Wiki pattern. Includes Python linter, consume helper, and distribution guide. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill okf` | All |

| `npm-git-install` | Routing-first Node package delivery skill for npm / pnpm / Yarn / Bun — choose temporary Git bridge, SHA pin, tarball, workspace, or publish-first handoff safely | All |
| `obsidian-second-brain` | Routing front door for a **self-rewriting Obsidian vault** (evolves Karpathy's LLM-Wiki) — every source REWRITES existing pages, reconciles contradictions, and synthesizes patterns automatically. 45 commands across 4 layers (Operations / Thinking / Context / Research) + background & scheduled agents + 4 role presets + AI-first write validator. Cross-CLI. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill obsidian-second-brain` | All |

| `opencontext` | Routing-first active project/repo memory — choose memory-layer choice, load-context, search-context, store-conclusions, setup-integration, or repo-packer route-out for manifests, stable links, cross-agent handoff packets, and highest-confidence-source / freshness checks when notes overlap | All |
| `workflow-automation` | Routing-first repo workflow automation — choose one mode for task-entrypoints, bootstrap/onboarding, local-CI parity, hook guardrails, maintenance bots, or workflow cleanup without drifting into environment/deploy work | All |
| `claudekit` | Standardized Claude Code workflow toolkit — claudekit plugin installation, init, update, hook management, and workspace configuration for consistent Claude Code setups | All |
| `ghgrab` | Search and download specific files/folders from GitHub repositories directly from terminal using ghgrab, without full repo cloning | All |

### 🛠 Utilities (Productivity) (6)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `ponytail` | Write the least code that fully solves the task — YAGNI ladder (skip → stdlib → native → installed dep → one line), `ponytail:` upgrade-path markers, `lite/full/ultra/off` intensity, and sharper `/ponytail-review` / `-audit` / `-debt` contracts for delete-lists and debt ledgers. Never cuts validation, data-loss handling, security, or accessibility. Plugin: `npx skills add https://github.com/akillness/jeo-skills --skill ponytail` | All |
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
| [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) | harness | 27-agent webtoon production team (trend → vertical-scroll viewer) plugin |

> Install & integration notes → [docs/harness/README.md](docs/harness/README.md) · packaged skill → [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md)

---

## 📁 Structure

```text
.
├── .agent-skills/          ← 145 skill folders (each with SKILL.md + SKILL.toon)
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
| `webtoon-harness` | `webtoon harness`, `make a webtoon` | [.agent-skills/webtoon-harness/SKILL.md](.agent-skills/webtoon-harness/SKILL.md) |
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
| `webtoon-harness` | [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) | MIT |

| `llm-wiki` | [karpathy/llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | — |
| `obsidian-second-brain` | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) (fork: [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain)) | MIT |
| `graphify` | [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT |
| `browser-harness` | [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | MIT |
| `scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| `semble` | [MinishLab/semble](https://github.com/MinishLab/semble) | MIT |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 |
| `autoresearch` | Andrej Karpathy methodology | — |
| `research-paper-writing` | [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | — |
| `academic-research` | [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) | CC-BY-NC-4.0 |
| `open-code-review` | [alibaba/open-code-review](https://github.com/alibaba/open-code-review) | Apache-2.0 |
| Agent Skills Spec | [agentskills.io](https://agentskills.io/specification) | — |

---

<div align="center">

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/akillness3q)

⭐ If this helps you, star the repository!

```bash
gh api --silent --method PUT /user/starred/akillness/jeo-skills >/dev/null 2>&1 || true
```

</div>
