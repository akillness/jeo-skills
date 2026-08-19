# Agent Skills

<div align="center">

[![Skills](https://img.shields.io/badge/Skills-209-blue?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![Platform](https://img.shields.io/badge/Platform-Claude%20%7C%20Gemini%20%7C%20Codex%20%7C%20OpenCode%20%7C%20jeopi-orange?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![GJC](https://img.shields.io/badge/GJC-gajae--code-181717?style=for-the-badge&logo=github)](https://github.com/akillness/gajae-code)
[![jeo-code](https://img.shields.io/badge/jeo--code-jeo-181717?style=for-the-badge&logo=github)](https://github.com/akillness/jeo-code)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

**209 categorized skills · lightweight selective install · compact TOON catalog · cross-platform**

A curated collection for spec-first, multi-agent LLM workflows. Delegate a complete setup
with one prompt, or install the `jeo-skill` router first and add only the web,
infrastructure, game, media, CLI, or utility skills you need.

[Quick Start](#-installation) · [Skills List](#-skills-list) · [한국어](README.ko.md)

</div>

---

## 💡 What is Agent Skills?

Each skill remains discoverable as `.agent-skills/<name>/SKILL.md`. Category, subcategory,
interface, bundle, and relationship metadata lives once in `.agent-skills/skills.json`, so
skills can be grouped without duplicating wrapper folders or moving runtime-facing paths.

## 🎮 Jeo Agent & The Legendary Equipment Set

`jeo-skills` acts as a legendary equipment set for the `@../jeo-code` Socratic spec-first AI coding agent, **Jeo** (`jeo`). Each core skill equips Jeo with a powerful tool to conquer complex codebases safely and efficiently:

| Equipment | Item | Core Skill / Hook | Role for Jeo |
| :--- | :--- | :--- | :--- |
| **Robe of Clarity** | <img src="assets/jeo-robe.gif" width="64" height="64"><br>Robe | [`ooo`](.agent-skills/ooo/SKILL.md) / `jeo deep-interview` | **Socratic Ambiguity Gate**: Wraps Jeo in wisdom, ensuring requirements are fully crystallized before coding. |
| **Armor of Lock** | <img src="assets/jeo-armor.gif" width="64" height="64"><br>Armor | [`ooo`](.agent-skills/ooo/SKILL.md) / `MutationGuard` | **Secure Codebase Mutation Guard**: Blocks codebase modifications while the Socratic interview is active. |
| **Boots of Swiftness** | <img src="assets/jeo-shoes.gif" width="64" height="64"><br>Shoes | [`cli-anything`](.agent-skills/cli-anything/SKILL.md) / `jeo team` | **Bounded Executor**: Drives real software through agent-native CLI harnesses swiftly and safely. |
| **Staff of Planning** | <img src="assets/jeo-staff.gif" width="64" height="64"><br>Staff | [`spec-kit`](.agent-skills/spec-kit/SKILL.md) / `jeo ralplan` | **Critiqued Planning Blueprint**: Channels architectural direction and planning power from frozen seeds. |
| **Carpet of Verification** | <img src="assets/jeo-carpet.gif" width="64" height="64"><br>Carpet | [`ooo`](.agent-skills/ooo/SKILL.md) / `jeo ultragoal` | **Durable Checkpoint Verification**: Flies over the codebase to verify success via `--json` output checks. |

*These animated items were generated using `god-tibo-imagen` (Codex ChatGPT backend) and compiled using `PIL`.*

---

## 🏗 Workflow & Architecture

<img src="assets/workflow.svg" alt="jeo-skills Workflow & Architecture" width="100%">
## 📦 Installation

### ✨ Recommended: LLM-driven install (one prompt, all platforms)

Hand the setup prompt to your coding agent (Claude Code, Codex, Gemini CLI, …). It reads the guide, detects your OS, installs the `skills` CLI, adds every skill into the correct per-agent paths, and registers the MCP/shell tools — no manual steps.

```bash
# Fetch the delegation guide and hand it to your agent
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

Or just paste the URL into the agent chat:

> Read https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md in full and follow it to install the jeo-skills.

The agent runs a **full install by default** (say “core only” or “minimal” to narrow it) and will:

- detect macOS / Linux / Windows and select `brew` / `snap` / `winget` + the right install paths,
- install the `skills` CLI and add skills with correct `-a` agent targeting (no duplicate platform exposure),
- register MCP tools (`ooo`, `semble`), shell tooling (`rtk`), and the `oh-my-claudecode` plugin,
- **preserve any pre-existing skills** — it only adds or updates, never deletes.

### Lightweight selective install (manual / CI)

Install the **`jeo-skill` router first**, not all 209 skill folders. It provides category,
subcategory, interface, bundle, and relationship discovery while keeping heavy apps,
models, MCP servers, and runtimes on demand.

```bash
# One lightweight skill, shared globally
npx --yes skills add https://github.com/akillness/jeo-skills \
  --skill jeo-skill --global --agent universal --yes --copy --full-depth

python3 "$HOME/.agents/skills/jeo-skill/scripts/jeo-skill.py" link
jeo-skill doctor
```

Browse and preview the narrowest useful selection:

```bash
jeo-skill categories
jeo-skill list --category web --subcategory frontend
jeo-skill list --category game --subcategory motion-vfx
jeo-skill related code-review
jeo-skill install --bundle web-frontend --dry-run
```

Install only the reviewed names or bundle:

```bash
jeo-skill install responsive-design react-best-practices --global --yes
jeo-skill install --bundle game-web --global --yes
```

The one-line installer uses the same lightweight default:

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash
```

Set `JEO_SKILLS_SELECTION=bundle`, `category`, or `all` only when that wider shell-installer
scope is intentional. See [setup-all-skills-prompt.md](setup-all-skills-prompt.md) for the
LLM-driven full default and the narrower “core only” and “minimal” modes.

### 🐜 Sponsored by ScrapingAnt — live web access for your agents
<p align="left"><a href="https://scrapingant.com?ref=ztewzmv"><img src="assets/scrapingant/scrapingant-logo.png" alt="ScrapingAnt" width="160"></a></p>


[ScrapingAnt](https://scrapingant.com?ref=ztewzmv) is a partner of jeo-skills and powers the
`scrapingant-web-fetch` skill: a hosted MCP server (`https://api.scrapingant.com/mcp`) that
fetches pages an agent normally cannot reach — Cloudflare-protected, bot-checked, or
JavaScript-only — and returns LLM-ready Markdown. Nothing runs locally: no browser binary,
no runtime, no MCP process to supervise.

```bash
jeo-skill install scrapingant-web-fetch --global --yes
export SCRAPINGANT_API_KEY="<your-key>"   # free key: https://scrapingant.com?ref=ztewzmv
bash .agent-skills/scrapingant-web-fetch/scripts/scrapingant.sh install claude-code
```

- **Free tier at signup:** 10,000 credits/month, no credit card, no rollover.
- **Cost-aware by design:** static fetch 1 credit · JS rendering 10 · residential proxy 25/125 —
  the skill escalates only after a cheaper attempt actually fails.
- **Three tools:** `get_web_page_markdown` (default), `get_web_page_html`, `get_web_page_text`.
- **Clients:** Claude Code, Claude Desktop, Cursor, Windsurf, Cline, VS Code / GitHub Copilot.
- **Guide:** [`.agent-skills/scrapingant-web-fetch/SKILL.md`](.agent-skills/scrapingant-web-fetch/SKILL.md) ·
  partnership scope and decisions in [`docs/scrapingant-partnership.md`](docs/scrapingant-partnership.md).

Signing up through the link above supports this repository at no extra cost to you, and the API
key stays yours — jeo-skills never ships or stores it.

### On-demand video motion previs

`video-motion-previs` remains a CLI-first motion workflow. Its desktop app and generated
model/runtime assets are installed only when a real motion task needs them.

```bash
jeo-skill install video-motion-previs --global --yes
video-motion-previs check
```
---

## 📚 Skills List

> Central manifest: `.agent-skills/skills.json` · 209 skills · 10 primary categories · subcategory/interface/relationship metadata

### 🌐 Web (47)

Subcategories: `frontend` (6), `backend` (3), `design` (11), `api` (2), `auth` (1), `data` (4), `testing` (3), `accessibility` (1), `performance` (1), `graphics` (10), `capture` (5)

| Skill |
|---|
| `ax` |
| `react-best-practices` |
| `react-bits` |
| `state-management` |
| `amrouter` |
| `colibri` |
| `pydantic-ai` |
| `astryx` |
| `build-daily-inspiration-sites` |
| `daily-ui-inspiration-capture` |
| `design-first-ui-prompting` |
| `design-system` |
| `devup-ui` |
| `html-to-interaction-prompts` |
| `lazyweb` |
| `responsive-design` |
| `stitch-skills` |
| `web-design` |
| `api-design` |
| `api-documentation` |
| `authentication-setup` |
| `database-schema-design` |
| `payloadcms` |
| `supabase-agent-skills` |
| `typesense` |
| `backend-testing` |
| `browser-harness` |
| `playwriter` |
| `web-accessibility` |
| `optimize-web-animations` |
| `threejs-animation` |
| `threejs-fundamentals` |
| `threejs-geometry` |
| `threejs-interaction` |
| `threejs-lighting` |
| `threejs-loaders` |
| `threejs-materials` |
| `threejs-postprocessing` |
| `threejs-shaders` |
| `threejs-textures` |
| `agentation` |
| `react-grab` |
| `slides-grab` |
| `stitched-full-page-capture` |
| `chatbot-template` |
| `airship` |
| `moli` |

### 🏗 Infrastructure (12)

Subcategories: `deployment` (2), `environment` (2), `observability` (2), `security` (2), `cloud-data` (3), `automation` (0), `tooling` (1)

| Skill |
|---|
| `deployment-automation` |
| `vercel-deploy` |
| `environment-setup` |
| `system-environment-setup` |
| `log-analysis` |
| `monitoring-observability` |
| `security-best-practices` |
| `strix` |
| `firebase-cli` |
| `unity-cli` |
| `genkit` |
| `looker-studio-bigquery` |

### 🎮 Game (22)

Subcategories: `client` (2), `web` (2), `server` (0), `design-ui` (4), `audio` (1), `animation` (2), `motion-vfx` (2), `sprite-image` (1), `art-resources` (0), `storytelling` (0), `tooling` (2), `qa-performance` (4), `release` (2)

| Skill |
|---|
| `implement-fog-of-war` |
| `unity-gamedev-skill-pack` |
| `agentic-gamedev-skills` |
| `web-game-development` |
| `bmad-gds` |
| `open-design-game-ui-concept` |
| `open-design-game-ui-handoff` |
| `open-design-game-ui-takeover` |
| `rfxgen` |
| `animato` |
| `unirig` |
| `dalamud-vfx-editor` |
| `game-vfx` |
| `perfectpixel` |
| `game-studio-harness` |
| `underworld-overseer-save-mapper` |
| `game-build-log-triage` |
| `game-demo-feedback-triage` |
| `game-performance-profiler` |
| `wai-play` |
| `game-ci-cd-pipeline` |
| `steam-store-launch-ops` |

### 🎬 Creative Media (20)

Subcategories: `image` (5), `video` (9), `motion` (1), `audio` (1), `presentation` (1), `diagram` (1), `design` (1), `capture` (0), `storytelling` (1)

| Skill |
|---|
| `aura-asset-images` |
| `generate-reference-inspired-brand-worlds` |
| `god-tibo-imagen` |
| `paperbanana` |
| `unsplash-asset-images` |
| `browser-video-recording` |
| `gbro-collage-broll` |
| `opencut` |
| `remotion-video-production` |
| `video-production` |
| `video-shotcraft` |
| `video-to-superprompt` |
| `vox-director` |
| `video-motion-previs` |
| `elevenlabs-tts` |
| `presentation-builder` |
| `drawio` |
| `open-design` |
| `webtoon-harness` |
| `palmier-pro` |

### ⌨️ CLI Tools (28)

Subcategories: `developer-cli` (7), `ai-cli` (9), `media-cli` (1), `automation-cli` (6), `search-cli` (4), `benchmark-cli` (1)

| Skill |
|---|
| `soup` |
| `caveman` |
| `ccpi-marketplace` |
| `cli-anything` |
| `ghgrab` |
| `jeo-skill` |
| `pretext` |
| `aider-cli-workflow` |
| `claudekit` |
| `fabric` |
| `ooo` |
| `open-code-review` |
| `ponytail` |
| `zeude` |
| `compresso` |
| `codeflow` |
| `graphify` |
| `npm-git-install` |
| `okf` |
| `rtk` |
| `tokhub` |
| `scrapling` |
| `scrapingant-web-fetch` |
| `semble` |
| `x-twitter-scraper` |
| `hyperfine-benchmarking` |
| `codeburn` |
| `mcp-server-sv-number` |

### 🤖 AI & Agents (28)

Subcategories: `orchestration` (4), `agent-frameworks` (3), `skill-authoring` (4), `evaluation` (4), `memory` (1), `planning-review` (8), `discovery` (1), `prompting` (3)

| Skill |
|---|
| `bmad` |
| `deep-dive` |
| `deepinit` |
| `spec-kit` |
| `microsoft-agent-framework` |
| `openai-agents-python` |
| `goalflow` |
| `article-prompts-to-skills` |
| `skill-standardization` |
| `upskill` |
| `write-a-skill` |
| `langsmith` |
| `opik` |
| `skill-autoresearch` |
| `kadath` |
| `mex` |
| `bmad-idea` |
| `grill-me` |
| `grill-with-docs` |
| `plannotator` |
| `survey` |
| `to-issues` |
| `to-prd` |
| `triage` |
| `openspace` |
| `agentic-skills` |
| `agenticskills` |
| `prompts-chat` |

### 🧰 Engineering (20)

Subcategories: `code-quality` (10), `testing` (4), `architecture` (3), `documentation` (2), `code-navigation` (1)

| Skill |
|---|
| `audit-reference-originality` |
| `audit-verify-explain-grade-5` |
| `code-refactoring` |
| `code-review` |
| `debugging` |
| `diagnose` |
| `github-repo-candidate-quality-gate` |
| `migrate-to-shoehorn` |
| `performance-optimization` |
| `performance-profiling` |
| `harness` |
| `scaffold-exercises` |
| `tdd` |
| `testing-strategies` |
| `improve-codebase-architecture` |
| `zoom-out` |
| `nightrun` |
| `changelog-maintenance` |
| `technical-writing` |
| `codebase-search` |

### 🔭 Research & Analysis (9)

Subcategories: `academic` (2), `web-research` (2), `data-analysis` (2), `experimentation` (1), `benchmarking` (1), `intelligence` (1)

| Skill |
|---|
| `academic-research` |
| `research-paper-writing` |
| `deep-research` |
| `heretic` |
| `data-analysis` |
| `pattern-detection` |
| `autoresearch` |
| `scientific-llm-benchmarks` |
| `agent-pulse` |

### 📣 Business (6)

Subcategories: `marketing` (3), `support` (2), `publishing` (1)

| Skill |
|---|
| `marketing-automation` |
| `write-like-meng-on-x` |
| `x-bookmark-quote-posts` |
| `customer-email-draft-threads` |
| `customer-support-verification` |
| `yuwen-publish-precheck` |

### 🔧 Utilities (17)

Subcategories: `knowledge` (6), `files` (2), `git` (3), `workspace` (1), `project-management` (4), `productivity` (1), `general` (0)

| Skill |
|---|
| `lapian-notes` |
| `llm-wiki` |
| `notebooklm` |
| `obsidian-mind` |
| `obsidian-second-brain` |
| `opencontext` |
| `file-organization` |
| `git-guardrails-claude-code` |
| `git-submodule` |
| `git-workflow` |
| `game-sounds` |
| `sprint-retrospective` |
| `standup-meeting` |
| `task-estimation` |
| `task-planning` |
| `google-workspace` |
| `watermarks-remover` |

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

Spec-first development front door: clarify ambiguous requests with a **git-grounded interview**, freeze the contract, render the execution plan through **spec-kit**, execute through **cli-anything harnesses**, and verify before claiming done. MCP server install: `claude mcp add ooo -s user -- ouroboros mcp`.

| Phase | Owner | Description |
|-------|-------|-------------|
| Clarify / Spec | `ooo interview` | Interview grounded in live git data (`.ouroboros/interview-context.md`: commits · churn · contributors, regenerated every interview); freeze acceptance criteria before execution |
| Plan | `spec-kit` (`/speckit.plan` → `/speckit.tasks`) | Render the reviewable execution plan **from the frozen seed** (one-way seed → plan; installed by default via `OOO_SPEC_KIT=1`) |
| Plan / Review | `plannotator` + `bmad` | Shape and approve the plan without reopening settled work |
| Execute | `cli-anything` (`cli-hub search` → `install` → `launch`) | Drive real software through agent-native CLI harnesses; `--json` output is the evaluate-stage evidence (installed by default via `OOO_CLI_ANYTHING=1`) |
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

Socratic interview **grounded in updated git data** → immutable seed/spec → **spec-kit renders the execution plan from the seed** → **execute through cli-anything harnesses** (`--json` output = evaluate evidence) → verify before done → keep looping until completion is actually verified. Installable as a Claude Code plugin or via pip; the skill installer wires all three integrations by default.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add Q00/ouroboros

# pip
pip install ouroboros-ai[all]

# Skill install (any platform)
npx skills add https://github.com/akillness/jeo-skills --skill ooo

# One-shot installer: skill + ouroboros-ai + git interview + spec-kit + cli-anything
bash .agent-skills/ooo/scripts/install.sh
# knobs: OOO_GIT_INTERVIEW=0 · OOO_SPEC_KIT=0 · OOO_CLI_ANYTHING=0 · SPEC_KIT_REF=<ref>

# Usage
bash .agent-skills/ooo/scripts/git-interview-context.sh   # refresh live git context
ouroboros init start "I want to build a task management CLI"
# after seed freeze: /speckit.plan → /speckit.tasks (from the seed)
cli-hub search <keyword> && cli-hub install <name>        # arm execute harnesses
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
├── .agent-skills/          ← 209 skill folders (SKILL.md + optional support files)
├── docs/                   ← detailed guides (bmad, plannotator, ooo, ...)
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
| `game-studio-harness` | `game production harness`, `게임 제작 하네스`, `stage gate` | [.agent-skills/game-studio-harness/SKILL.md](.agent-skills/game-studio-harness/SKILL.md) |
| `heretic` | `heretic`, `abliterate`, `decensor a model` | [.agent-skills/heretic/SKILL.md](.agent-skills/heretic/SKILL.md) |
| `bmad` | `bmad` | [docs/bmad/README.md](docs/bmad/README.md) |
| Harness OSS | — | [docs/harness/README.md](docs/harness/README.md) |
| `scrapingant-web-fetch` | `scrapingant`, `mcp web scraping`, `fetch blocked page` | [.agent-skills/scrapingant-web-fetch/SKILL.md](.agent-skills/scrapingant-web-fetch/SKILL.md) |
| ScrapingAnt partnership (sponsor) | `scrapingant`, `sponsor` | [docs/scrapingant-partnership.md](docs/scrapingant-partnership.md) |

---

## 📎 References

| Component | Source | License |
|-----------|--------|---------|
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
| `heretic` | [p-e-w/heretic](https://github.com/p-e-w/heretic) | AGPL-3.0-or-later |

| `llm-wiki` | [karpathy/llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | — |
| `obsidian-second-brain` | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) (fork: [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain)) | MIT |
| `graphify` | [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT |
| `browser-harness` | [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | MIT |
| `scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| `semble` | [MinishLab/semble](https://github.com/MinishLab/semble) | MIT |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 |
| `autoresearch` | Andrej Karpathy methodology | — |
| `nightrun` | [hardrave/NIGHTRUN](https://github.com/hardrave/NIGHTRUN) | MIT |

| `soup` | [MakazhanAlpamys/Soup](https://github.com/MakazhanAlpamys/Soup) | Apache-2.0 |
| `wai-play` | [waiterve/wai-play](https://github.com/waiterve/wai-play) | — |
| `goalflow` | [wanmol/goal-flow](https://github.com/wanmol/goal-flow) | MIT |

| `research-paper-writing` | [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | — |
| `academic-research` | [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) | CC-BY-NC-4.0 |
| `open-code-review` | [alibaba/open-code-review](https://github.com/alibaba/open-code-review) | Apache-2.0 |
| Agent Skills Spec | [agentskills.io](https://agentskills.io/specification) | — |

---

<!-- WHATS-NEW:START -->

## 🆕 What's New in v2026-08-09

| Change | Details |
|--------|---------|
| **goalflow LangGraph framework** | Added `goalflow` for [wanmol/goal-flow](https://github.com/wanmol/goal-flow), a Graph-Orchestrated Agent Loop that combines workflow graphs with agent loops and transpiles Dify DSL exports into runnable LangGraph Python. Six modes (`orient`, `transpile`, `build`, `agent`, `serve`, `harden`). Ships a read-only `goalflow.sh doctor` (packages, project imports, `.env` key **names** only), a stdlib-only `preflight_audit.py` implementing the upstream pre-publish checklist (`.env*` blobs reachable in git history, RFC1918 hosts, open-CORS-with-credentials, MD5 API-key auth, `CodeNode` `exec`), and a `check_goalflow_skill.py` that validates runtime `SKILL.md` frontmatter and flags verbatim-injection prompt cost. References cover the transpiler, the `BaseNode` contract, `agent_kit`, the skills engine, the adapter/streaming/HITL layer, and the security gate. |
| **WAI Play web-game auto-playtesting** | Added `wai-play` for [waiterve/wai-play](https://github.com/waiterve/wai-play): an agent that drives a real browser against a running web game and returns a five-dimension quality score with reproducible problem cards. The skill routes six modes (`testability`, `integration`, `run`, `report`, `scenario-gap`, `ops`) and puts testability before any run. Ships a read-only `wai-play.sh doctor` (Python, Playwright Chromium, `.env` key **names** only), a stdlib-only `check_integration.py` that statically checks a `GameFlowAgentAPI` file for missing methods, leftover throw-stubs, and template placeholders, plus references for the API contract, the five game-type profiles and key nodes, the scoring weights and evidence rules, and setup/route-outs. Keeps game quality and test credibility separate, and states the local-only operating boundary rather than implying it is deploy-ready. |

## 🆕 What's New in v2026-07-29

| Change | Details |
|--------|---------|
| **UniRig auto-rigging pipeline** | Added `unirig` for [VAST-AI-Research/UniRig](https://github.com/VAST-AI-Research/UniRig) (SIGGRAPH'25): skeleton prediction → skinning weights → merge back onto the original textured asset. Ships a blocking-item `doctor.sh` readiness report, an `install.sh` that follows the upstream CUDA/spconv/PyG install order, a `rig.sh` wrapper with `--dry-run` planning and per-stage artifact verification, and route-outs for machines without an NVIDIA GPU. |
| **Animato text-to-animation loop** | Added `animato`, an API-key agent loop for [otdnnc/Animato](https://github.com/otdnnc/Animato): upload a rigged model, build the bpy prompt, spend one LLM call, gate the generated script with `validate_bpy_script.py`, then execute it headless. Ships a stdlib-only CLI (`animato_agent.py`), a static gate for removed Blender APIs and missing animation-bake flags, and an offline `selftest.py` that exercises the whole loop against a stub server. |
| **Ten Three.js implementation skills** | Added `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`, `threejs-lighting`, `threejs-textures`, `threejs-loaders`, `threejs-animation`, `threejs-interaction`, `threejs-shaders`, and `threejs-postprocessing`, adapted from [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills). Each has a focused implementation contract, compact TOON discovery surface, evals, and upstream/official references; direct rendering work stays distinct from `web-game-development` game-system routing. |
| **Open Design game UI skills** | Added `open-design-game-ui-concept`, `open-design-game-ui-handoff`, and `open-design-game-ui-takeover` for concept review, evidence-backed handoffs, and approved runtime integration. |
| **Lightweight category catalog** | Reorganized 192 skills into 10 primary categories and 74 focused subcategories with interface metadata, curated bundles, and relationship groups. Added the selectively installed `jeo-skill` CLI; the default installer no longer copies the full catalog or installs heavy dependencies. Compact `skills.toon` now contains one record per skill, and `skills.json` is version 2.0.0. |

## 🆕 What's New in v2026-07-28

| Change | Details |
|--------|---------|
| **Catalog now 152 skills** | Removed 16 skill folders (`lmstudio-cli`, `ohmg`, `omc`, `omx`, `prompt-repetition`, `setup-pre-commit`, `spec-stack`, `team`, `ui-component-patterns`, `ultraqa`, `ultrawork`, `user-guide-writing`, `vibe-kanban`, `video-production`, `web-design-guidelines`, `workflow-automation`) and added 3 (`obsidian-mind`, `openspace`, `web-game-development`). `skills.json`, `skills.toon`, `skills-lock.json`, and both README catalog tables were regenerated; `scripts/validate-catalog-projections.py` passes at 152. |
| **No more platform-exclusive skills** | With `omc` / `ohmg` / `omx` gone, the manifest is a single shared catalog. Step 1 of `setup-all-skills-prompt.md` now installs everything, the Step 2 platform-install block was replaced by a stray-copy audit, and Step 4's platform dedup check became a shared-root shadow check. |
| **Step 3g reduced to OpenCode plugin setup** | The `oh-my-claudecode`, `oh-my-codex` (OMX), and `oh-my-agent` (OMA) installers existed only to back the removed routing skills and were dropped; the `oh-my-openagent` (OMO) block is unchanged. `scripts/test-runtime-config-writers.sh` replaced its OMX handoff case with a no-config-mutation check and still passes all 25 cases. |
| **obsidian-mind / web-game-development descriptions trimmed** | Both shipped with frontmatter descriptions over the 1024-character limit, which makes a skill invisible to `skills add`. Rewritten under the cap with their trigger keywords intact. |
| **Dangling route-outs rewired** | Every surviving skill that routed to a removed skill was repointed. `autopilot` was removed as the last orphan of the `$team` / `$ultrawork` / `$ultraqa` exact-name shim family; `video-production` was restored. `ui-component-patterns` scope moved into `design-system`, `web-design-guidelines` into `web-accessibility` (broad-review mode), `user-guide-writing` into `technical-writing` (end-user guide mode), `workflow-automation` into `deployment-automation` (CI/release-job authoring), `vibe-kanban` into `task-planning` / `triage`, and `omc` / `omx` / `ohmg` into their external product names (`oh-my-claudecode` / `oh-my-codex` / `oh-my-agent`). `deep-dive` and `deepinit` were left alone — their `.omc` / `.omx` references are runtime state paths, not skills. |

> 📜 Older entries: [`changelog/en/`](changelog/en/) (monthly files, newest first).

<!-- WHATS-NEW:END -->

---

<div align="center">

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/akillness3q)

⭐ If this helps you, star the repository!

```bash
gh api --silent --method PUT /user/starred/akillness/jeo-skills >/dev/null 2>&1 || true
```

</div>
