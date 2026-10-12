# Agent Skills

<div align="center">

[![Skills](https://img.shields.io/badge/Skills-366-blue?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![Platform](https://img.shields.io/badge/Platform-Claude%20%7C%20Gemini%20%7C%20Codex%20%7C%20OpenCode%20%7C%20jeopi-orange?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![GJC](https://img.shields.io/badge/GJC-gajae--code-181717?style=for-the-badge&logo=github)](https://github.com/akillness/gajae-code)
[![jeo-code](https://img.shields.io/badge/jeo--code-jeo-181717?style=for-the-badge&logo=github)](https://github.com/akillness/jeo-code)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

**366 categorized skills · lightweight selective install · compact TOON catalog · cross-platform**

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
<img src="assets/architecture.svg" alt="jeo-skills Catalog Architecture" width="100%">

### Jev Control Plane (optional System One integration)

Jev is a separate, home-scoped opt-in, not part of default catalog installation, even in full mode. Source lives in [`jev/`](jev/README.md); the canonical `jev/jev-setup.sh` configures the chosen backend and installs the harness plus a host rule. Rule placement is not a native hook or proof of runtime enforcement: the host must load and follow it.

| Stage | Command | Role |
| :--- | :--- | :--- |
| Skill routing | `route-skills "<task>"` | Cap-aware selection over read-only `skills.json`: gate Nouls, then sharded Choice or a lexical shortlist reranked by fit Nouls → Top-K skills or an explicit "none"; advisory `provider/model` routing from `model_policies` |
| Context pruning | `prune-context` | JSONL `{id,text}` blocks → keep/drop verdicts, batched within the answering backend's state limit |
| Action gate | `review "<task>" '<proposal>'` | `permit` / `proposal_only` / `reject` / `unavailable` + SHA-256 receipt bound to backend, model, and tier |

Discovery starts with the **local catalog** (`route-skills` / `jeo-skill`). A weak local match emits `publicRegistryFallback` for the **public skills.sh registry** through `find-skills`; review candidates and obtain explicit approval before installation. The harness does not search or install public skills itself.

**Backends and per-operation routing.** Five backend kinds share one decision contract: `api` (hosted TypeSafe), `local` (full-precision JEV-9B server), `ollama` / `lmstudio` (quantized GGUF over chat), and `systemone` (an operator-run endpoint: TypeSafe-compatible, AutoTrust `/v1/decide`, or a vLLM `jev-decision` head). Each operation resolves its own backend from the profile — `JEV_ROUTE_SKILLS_BACKEND`, `JEV_PRUNE_CONTEXT_BACKEND`, `JEV_REVIEW_BACKEND` — with an ordered `_FALLBACK` allow-list; setup writes them with `--route-backend`, `--prune-backend`, `--review-backend`, and `--fallback <op>=<kind[,kind]>`, and `--backend` / `--model` override a single call. Every backend is tier `unvalidated` unless an attestation (`--validated-model`) matches the model it reports serving, and only calibrated decision-head drivers (`api`, `systemone`) can be validated: `review` permits only on a validated tier, so `local`, `ollama`, and `lmstudio` recommend but never authorize. Optional `skills.json` `model_policies` add advisory per-skill `provider/model` routing to `route-skills` output; hosts are not adapted yet. Setup also installs a catalog snapshot so `route-skills` works outside a checkout.

Choose `api`, `local`, `ollama`, `lmstudio`, or `systemone` only after approving credentials, downloads, and server side effects; `skip` preserves existing Jev state. An unset choice with no TTY skips Jev without fetching its setup script. Project catalog installs never configure global Jev. `status [--operation <op>]` reports each operation's backend chain and distinguishes configured opt-in from limited backend readiness: API key presence does not prove hosted authentication or health. Configured outages fail closed, rather than bypassing review. `--mock` validates offline contracts only and never authorizes real actions. See [`jev/README.md`](jev/README.md) for settings, exit codes, and validation limits.

### Jevgrep (optional remote source discovery)

[Jevgrep](.agent-skills/jevgrep/SKILL.md) is a separate `jg` CLI, not the Jev control-plane harness. Defaults remain local catalog metadata, native exact search/LSP, zvec-grep workspace retrieval, and Graphify `query` / `path` / `explain` for graph relationships. Explicitly selected skill documents, wiki Markdown, and graph source documents can be searched as text; Jevgrep does not traverse graph binaries, mutate sources, or rebuild graphs.

Preview a narrowly scoped public documentation root without invoking Jevgrep:

```bash
jeo-skill explore "Which document explains checkpoint ownership?" --root /path/to/jeo-skills/docs --dry-run
# Only after separate query/source-upload/cost approval, with jg and saved credentials already configured:
jeo-skill explore "Which document explains checkpoint ownership?" --root /path/to/jeo-skills/docs --allow-remote
```

Remote execution sends the query and eligible source content to the configured provider and may incur charges; saved credentials are not consent. Blanket setup does not install or authenticate Jevgrep. See the [manual opt-in guide](setup-all-skills-prompt.md#jevgrep-optional-remote-source-discovery) for the pinned install and limits. Dry-run is an inert plan, and local `jg files -- ROOT` reports counts only, not filenames or a privacy certification. Neither proves live provider search quality; that has not been exercised here.


## 📦 Installation

### ✨ Recommended: LLM-driven install (one prompt, all platforms)

Hand the setup prompt to your coding agent (Claude Code, Codex, Gemini CLI, …). It reads the guide, detects your OS, installs the `skills` CLI, adds every skill into the correct per-agent paths, and registers the listed shared MCP/shell tools. Optional Jev and Jevgrep runtime setup still requires separate approval.

```bash
# Fetch the delegation guide and hand it to your agent
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

Or just paste the URL into the agent chat:

> Read https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md in full and follow it to install the jeo-skills.

The agent runs a **full install by default** (say "core only" or "minimal" to narrow it) and will:

- detect macOS / Linux / Windows and select the native package manager,
- install the `skills@1.7.0` CLI and add skills to the universal shared root (`~/.agents/skills`), which jeopi, jeo-code, oh-my-pi, Claude Code, Codex, Gemini CLI, and OpenCode automatically discover and load,
- **GJC requires native projection** to `~/.gjc/agent/skills` (global) or `.gjc/skills` (project) since it does not load shared providers; the setup guide handles this automatically,
- **Antigravity IDE and CLI require native projection** (see setup guide Step 4C) since `skills@1.7.0` installs to shared root regardless of `--agent` flag,
- register MCP tools (`ooo`, `semble`), shell tooling (`rtk`), and platform-specific integrations,
- **preserve any pre-existing skills** — it only adds or updates, never deletes.

Jev remains optional in all catalog modes: default setup does not download Jev models or install Jev rules/hooks. The root installer offers a default-no prompt only in an interactive home-scoped session; the delegation guide requires explicit approved opt-in before running Jev setup.
> [!NOTE]
>
> **Included in the catalog:** **`scrapingant-web-fetch`** gives agents a hosted MCP fetch tool
> that handles Cloudflare/bot-checks and JS-only pages and returns LLM-ready Markdown, with
> no local browser. It needs your own API key, so the setup guide only configures it on
> explicit request. Details:
> [`.agent-skills/scrapingant-web-fetch/SKILL.md`](.agent-skills/scrapingant-web-fetch/SKILL.md).

### Lightweight selective install (manual / CI)

Install the **`jeo-skill` router first**, not all 366 skill folders. It provides category,
subcategory, interface, bundle, and relationship discovery while keeping heavy apps,
models, MCP servers, and runtimes on demand.

```bash
# One lightweight skill, shared globally
# Automatically discovered by jeopi, jeo-code, oh-my-pi, Claude Code, Codex, Gemini CLI, OpenCode
# (GJC receives native projection to ~/.gjc/agent/skills automatically)
npx --yes skills@1.7.0 add https://github.com/akillness/jeo-skills \
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

**Project-local install** (install skills only for the current project):

```bash
npx --yes skills@1.7.0 add https://github.com/akillness/jeo-skills \
  --skill jeo-skill --agent universal --yes --copy --full-depth

python3 "$PWD/.agents/skills/jeo-skill/scripts/jeo-skill.py" link --project
jeo-skill install responsive-design --project --yes
```

The one-line installer uses the lightweight default:

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash
```

To control scope and selection, set environment variables:

```bash
# Install core bundle instead of router only
JEO_SKILLS_SELECTION=bundle bash -c 'curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash'

# Project-local instead of global
INSTALL_GLOBAL=false JEO_SKILLS_SELECTION=bundle bash -c 'curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash'
```

Available modes:
- `JEO_SKILLS_SELECTION=router` (default) — install the jeo-skill catalog router only
- `JEO_SKILLS_SELECTION=bundle` — install the `starter` bundle through jeo-skill
- `JEO_SKILLS_SELECTION=all` — install every skill in the catalog

### On-demand video motion previs

`video-motion-previs` remains a CLI-first motion workflow. Its desktop app and generated
model/runtime assets are installed only when a real motion task needs them.

```bash
jeo-skill install video-motion-previs --global --yes
video-motion-previs check
```

### On-demand FilmCraft repository operator

[`filmcraft`](https://github.com/storytold/filmcraft/tree/1fdfd8324db4aa23b08c69f518b086e632f75f84)
is a source-pinned operator for FilmCraft, an open-source nonlinear video editor written in
pure Rust. Installing the skill adds instructions only; it does **not** install FilmCraft,
Rust/Cargo, the desktop app, `filmcraft-cli`, optional fonts, media, or MCP/client registration.

Preview and then explicitly apply the skill install:

```bash
jeo-skill install filmcraft --global --dry-run
jeo-skill install filmcraft --global --yes
```

Use FilmCraft only for local project/sequence inspection, editing, preview rendering, export,
or automation. Source setup is separate; proceed when the user explicitly requests the operation and
its scope is clear (`cargo build --release -p filmcraft-cli -p filmcraft`;
desktop demo/control uses `cargo run --release -p filmcraft` or `cargo run --release -p filmcraft -- --control 9876`).
Headless MCP uses `filmcraft-cli mcp --project /abs/project.fcproj`; a desktop bridge requires the
app control channel plus `filmcraft-cli mcp --bridge 127.0.0.1:9876`. No `filmcraft doctor` command
or folder-confinement flag is verified, and paths remain unrestricted under user permissions.
When using the desktop bridge, the app's currently selected project is authoritative; do not combine
`--bridge` with `--project` or `--demo`, which are silently ignored in bridge mode.
Optional fonts require a separate `craft-fonts` checkout and `CRAFT_FONTS_DIR`. Blanket setup never
builds FilmCraft, registers MCP, starts the app, downloads fonts, or imports media; an explicit user
request naming the operation and destination is sufficient. Ask only when scope, consent, destination,
or a new destructive action is unclear. For programmable/template video generation, use
`video-production` instead.


---

### On-demand repository operators

Eleven source-pinned operator skills cover `openrig`, `anyjev`,
`typesafe-computer-use`, `zurp`, `helix-foundry`, `uzu`, `context-mode`, `rea`,
`fineenvs`, `llmfit`, and `pg-jev`. Catalog installation adds instructions only;
applications, models, credentials, MCP/hook registration, desktop authority and
database writes remain separately approved operations. See the
[setup guide](setup-all-skills-prompt.md#repository-operators-on-demand-documents-only).


## 📚 Skills List

> Central manifest: `.agent-skills/skills.json` · 366 skills · 10 primary categories · subcategory/interface/relationship metadata

### 🌐 Web (52)

Subcategories: `frontend` (7), `backend` (3), `design` (12), `api` (2), `auth` (1), `data` (6), `testing` (4), `accessibility` (1), `performance` (1), `graphics` (10), `capture` (5)

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
| `design-taste-frontend` |
| `higgsfield-websites` |
| `stagehand` |
| `helix-foundry` |
| `pg-jev` |

### 🏗 Infrastructure (14)

Subcategories: `deployment` (2), `environment` (2), `observability` (3), `security` (3), `cloud-data` (3), `automation` (0), `tooling` (1)

| Skill |
|---|
| `deployment-automation` |
| `vercel-deploy` |
| `environment-setup` |
| `system-environment-setup` |
| `log-analysis` |
| `monitoring-observability` |
| `openocta` |
| `security-best-practices` |
| `strix` |
| `firebase-cli` |
| `unity-cli` |
| `genkit` |
| `looker-studio-bigquery` |
| `zurp` |

### 🎮 Game (28)

Subcategories: `client` (3), `web` (2), `server` (1), `design-ui` (7), `audio` (1), `animation` (2), `motion-vfx` (2), `sprite-image` (1), `art-resources` (0), `storytelling` (0), `tooling` (3), `qa-performance` (4), `release` (2)

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
| `godogen` |
| `game-build-log-triage` |
| `game-demo-feedback-triage` |
| `game-performance-profiler` |
| `wai-play` |
| `game-ci-cd-pipeline` |
| `steam-store-launch-ops` |
| `unity-technologies-skills` |
| `multiplayer-game-architecture` |
| `game-design-theory` |
| `game-feel` |
| `game-ui-ux` |

### 🎬 Creative Media (33)

Subcategories: `image` (10), `video` (14), `motion` (1), `audio` (1), `presentation` (1), `diagram` (1), `design` (3), `capture` (0), `storytelling` (2)

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
| `video-production` |
| `filmcraft` |
| `video-shotcraft` |
| `video-to-superprompt` |
| `vox-director` |
| `video-motion-previs` |
| `elevenlabs-tts` |
| `presentation-builder` |
| `drawio` |
| `open-design` |
| `blender-mcp` |
| `webtoon-harness` |
| `palmier-pro` |
| `openstory` |
| `drama-skills` |
| `openmontage` |
| `open-generative-ai` |
| `higgsfield-generate` |
| `higgsfield-marketplace-cards` |
| `higgsfield-product-photoshoot` |
| `higgsfield-soul-id` |
| `higgsfield-youtube-thumbnail` |
| `higgsfield-video-explainer` |
| `higgsfield-brandkit` |
| `shopping-shorts` |

### ⌨️ CLI Tools (40)

Subcategories: `developer-cli` (10), `ai-cli` (15), `media-cli` (1), `automation-cli` (6), `search-cli` (7), `benchmark-cli` (1)

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
| `headroom` |
| `npm-git-install` |
| `okf` |
| `rtk` |
| `tokhub` |
| `scrapling` |
| `agent-reach` |
| `scrapingant-web-fetch` |
| `semble` |
| `zvec-grep` |
| `x-twitter-scraper` |
| `hyperfine-benchmarking` |
| `codeburn` |
| `mole` |
| `mcp-server-sv-number` |
| `zeroshot` |
| `k-skill-setup` |
| `jevgrep` |
| `openrig` |
| `uzu` |
| `context-mode` |
| `rea` |
| `llmfit` |

### 🤖 AI & Agents (65)

Subcategories: `orchestration` (14), `agent-frameworks` (18), `skill-authoring` (5), `evaluation` (7), `memory` (2), `planning-review` (13), `discovery` (3), `prompting` (3)

| Skill |
|---|
| `bmad` |
| `deep-dive` |
| `deepinit` |
| `spec-kit` |
| `ecc` |
| `microsoft-agent-framework` |
| `openai-agents-python` |
| `goalflow` |
| `openexecutive` |
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
| `to-tickets` |
| `to-spec` |
| `triage` |
| `openspace` |
| `agentic-skills` |
| `agenticskills` |
| `prompts-chat` |
| `find-skills` |
| `mcp-builder` |
| `ask-matt` |
| `grilling` |
| `setup-matt-pocock-skills` |
| `to-questionnaire` |
| `wayfinder` |
| `writing-for-agents` |
| `agent-guardrails` |
| `agent-system-design` |
| `agent-tool-routing` |
| `reflexion-pattern` |
| `agent-manager` |
| `langchain-fundamentals` |
| `langchain-middleware` |
| `langchain-rag` |
| `langchain-dependencies` |
| `langgraph-fundamentals` |
| `langgraph-persistence` |
| `langgraph-human-in-the-loop` |
| `deep-agents-core` |
| `deep-agents-memory` |
| `deep-agents-orchestration` |
| `langchain-bmad` |
| `a2a-protocol` |
| `agent-benchmarking` |
| `agent-observability` |
| `multi-agent-eval-harness` |
| `agent-memory-architecture` |
| `agent-workflow` |
| `agent-principles` |
| `paperclip` |
| `jev-control-plane` |
| `anyjev` |
| `typesafe-computer-use` |

### 🧰 Engineering (24)

Subcategories: `code-quality` (11), `testing` (4), `architecture` (6), `documentation` (2), `code-navigation` (1)

| Skill |
|---|
| `audit-reference-originality` |
| `audit-verify-explain-grade-5` |
| `code-refactoring` |
| `code-review` |
| `debugging` |
| `diagnosing-bugs` |
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
| `codebase-design` |
| `domain-modeling` |
| `implement` |
| `prototype` |

### 🔭 Research & Analysis (13)

Subcategories: `academic` (3), `web-research` (3), `data-analysis` (2), `experimentation` (2), `benchmarking` (1), `intelligence` (2)

| Skill |
|---|
| `academic-research` |
| `research-paper-writing` |
| `scientific-agent-skills` |
| `deep-research` |
| `heretic` |
| `data-analysis` |
| `pattern-detection` |
| `autoresearch` |
| `scientific-llm-benchmarks` |
| `agent-pulse` |
| `research` |
| `korean-patent-search` |
| `fineenvs` |

### 📣 Business (70)

Subcategories: `marketing` (4), `support` (2), `publishing` (1), `pm-toolkit` (5), `pm-discovery` (13), `pm-strategy` (12), `pm-execution` (12), `pm-market-research` (7), `pm-analytics` (3), `pm-go-to-market` (6), `pm-growth` (5)

| Skill |
|---|
| `marketing-automation` |
| `write-like-meng-on-x` |
| `x-bookmark-quote-posts` |
| `customer-email-draft-threads` |
| `customer-support-verification` |
| `yuwen-publish-precheck` |
| `youtube-growth-playbook-2026` |
| `pm-skills` |
| `draft-nda` |
| `grammar-check` |
| `privacy-policy` |
| `review-resume` |
| `analyze-feature-requests` |
| `brainstorm-experiments-existing` |
| `brainstorm-experiments-new` |
| `brainstorm-ideas-existing` |
| `brainstorm-ideas-new` |
| `identify-assumptions-existing` |
| `identify-assumptions-new` |
| `interview-script` |
| `metrics-dashboard` |
| `opportunity-solution-tree` |
| `prioritize-assumptions` |
| `prioritize-features` |
| `summarize-interview` |
| `ansoff-matrix` |
| `business-model` |
| `lean-canvas` |
| `monetization-strategy` |
| `pestle-analysis` |
| `porters-five-forces` |
| `pricing-strategy` |
| `product-strategy` |
| `product-vision` |
| `startup-canvas` |
| `swot-analysis` |
| `value-proposition` |
| `brainstorm-okrs` |
| `create-prd` |
| `dummy-dataset` |
| `job-stories` |
| `outcome-roadmap` |
| `pre-mortem` |
| `prioritization-frameworks` |
| `stakeholder-map` |
| `summarize-meeting` |
| `test-scenarios` |
| `user-stories` |
| `wwas` |
| `competitor-analysis` |
| `customer-journey-map` |
| `market-segments` |
| `market-sizing` |
| `sentiment-analysis` |
| `user-personas` |
| `user-segmentation` |
| `ab-test-analysis` |
| `cohort-analysis` |
| `sql-queries` |
| `beachhead-segment` |
| `competitive-battlecard` |
| `growth-loops` |
| `gtm-motions` |
| `gtm-strategy` |
| `ideal-customer-profile` |
| `marketing-ideas` |
| `north-star-metric` |
| `positioning-ideas` |
| `product-name` |
| `value-prop-statements` |

### 🔧 Utilities (27)

Subcategories: `knowledge` (7), `files` (5), `git` (4), `workspace` (1), `project-management` (4), `productivity` (3), `general` (3)

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
| `solo-skills` |
| `eli5` |
| `handoff` |
| `resolving-merge-conflicts` |
| `teach` |
| `wait-what` |
| `wizard` |
| `hwp` |
| `rhwp-advanced` |
| `rhwp-edit` |

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
├── .agent-skills/          ← 366 skill folders (SKILL.md + optional support files)
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
| `filmcraft` | `filmcraft`, `filmcraft-cli`, `.fcproj`, `FilmCraft MCP` | [.agent-skills/filmcraft/SKILL.md](.agent-skills/filmcraft/SKILL.md) |
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
| `stagehand` | [browserbase/stagehand](https://github.com/browserbase/stagehand) | MIT |
| `scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| `agent-reach` | [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | MIT |
| `semble` | [MinishLab/semble](https://github.com/MinishLab/semble) | MIT |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 |
| `autoresearch` | Andrej Karpathy methodology | — |
| `nightrun` | [hardrave/NIGHTRUN](https://github.com/hardrave/NIGHTRUN) | MIT |

| `soup` | [MakazhanAlpamys/Soup](https://github.com/MakazhanAlpamys/Soup) | Apache-2.0 |
| `wai-play` | [waiterve/wai-play](https://github.com/waiterve/wai-play) | — |
| `goalflow` | [wanmol/goal-flow](https://github.com/wanmol/goal-flow) | MIT |

| `research-paper-writing` | [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | — |
| `academic-research` | [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) | CC-BY-NC-4.0 |
| `scientific-agent-skills` | [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | MIT wrapper; upstream terms vary by skill |
| `eli5` | [DreambigOu/ELI5](https://github.com/DreambigOu/ELI5) | MIT |
| `openocta` | [openocta/openocta](https://github.com/openocta/openocta) | Apache-2.0 wrapper |
| `open-code-review` | [alibaba/open-code-review](https://github.com/alibaba/open-code-review) | Apache-2.0 |
| `pm-skills` + 62 `pm-*` skills | [phuryn/pm-skills @ 8607e3b](https://github.com/phuryn/pm-skills) | MIT |
| `langchain-*`, `langgraph-*`, `deep-agents-*` (10) | [langchain-ai/langchain-skills @ 88df7d9](https://github.com/langchain-ai/langchain-skills) | MIT |
| `higgsfield-*` (8) | [higgsfield-ai/skills 0.12.0 @ d071406](https://github.com/higgsfield-ai/skills) | MIT |
| `hwp`, `rhwp-edit`, `rhwp-advanced`, `korean-patent-search`, `k-skill-setup` | [NomaDamas/k-skill @ 783d3c3](https://github.com/NomaDamas/k-skill) | MIT (proxy dirs AGPL-3.0, not vendored) |
| `a2a-protocol`, `agent-*`, `multi-agent-eval-harness`, `reflexion-pattern`, `langchain-bmad` (+4 merged into canonical skills, see `retired_skills`) | [akillness/oh-my-gods @ 1b2779a](https://github.com/akillness/oh-my-gods) | MIT |
| `paperclip` (operator guide; no upstream files vendored) | [paperclipai/paperclip @ 0f14d26](https://github.com/paperclipai/paperclip/tree/0f14d261233c545aa6a8a38ec253c498a5130fff) | MIT (upstream) |
| `openrig` | [mvschwarz/openrig @ 3001cc4](https://github.com/mvschwarz/openrig/tree/3001cc436656c435e54425443e708e3e2d8c7d68) | Apache-2.0 (upstream) |
| `anyjev` | [nokia-applied-research/AnyJev @ d458d13](https://github.com/nokia-applied-research/AnyJev/tree/d458d13968eec0e2cfa8c81b64629b96cf5cb4a9) | Apache-2.0 (upstream) |
| `typesafe-computer-use` | [awlevin/typesafe-computer-use @ 44ca11f](https://github.com/awlevin/typesafe-computer-use/tree/44ca11f0935b021b73020825da054b5c92cc1288) | MIT (upstream) |
| `zurp` | [facebookincubator/Zurp @ c30c04e](https://github.com/facebookincubator/Zurp/tree/c30c04edd8a0a85f3ee980324b7edc8e814fadb3) | MIT (project; FBDL provenance includes ISC) |
| `helix-foundry` | [HelixDB/helix-foundry @ 8489985](https://github.com/HelixDB/helix-foundry/tree/84899851d845d1db98f9e328634f14e0ed4ad7b7) | Apache-2.0 (upstream) |
| `uzu` | [trymirai/uzu @ d76d468](https://github.com/trymirai/uzu/tree/d76d468a1898cacc9c4920accf8f5ff099967107) | MIT (upstream) |
| `context-mode` | [mksglu/context-mode @ abb1048](https://github.com/mksglu/context-mode/tree/abb104847cbb66c2182816a72bb69455bc778b5e) | Elastic-2.0 (upstream; not OSI-approved) |
| `rea` | [morluto/rea @ ee50ed1](https://github.com/morluto/rea/tree/ee50ed121e38cc6e1a2ff0dc8b789f15f71c5402) | MIT (upstream) |
| `fineenvs` | [adithya-s-k/FineEnvs @ 5e0b46e](https://github.com/adithya-s-k/FineEnvs/tree/5e0b46e96bfd20105976e50a06a3b79c9c62f076) | Apache-2.0 (code; PortSim data terms differ) |
| `llmfit` | [AlexsJones/llmfit @ 4b9fdd9](https://github.com/AlexsJones/llmfit/tree/4b9fdd9c5d1da3aa38ee5f7de872a5555c029a3e) | MIT (upstream) |
| `pg-jev` | [realZachi/pg-jev @ e3450d4](https://github.com/realZachi/pg-jev/tree/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a) | PostgreSQL License (upstream) |
| Agent Skills Spec | [agentskills.io](https://agentskills.io/specification) | — |

---

<!-- WHATS-NEW:START -->

## 🆕 What's New in v2026-10-12

| Change | Details |
|--------|---------|
| **FilmCraft skill** | Added `filmcraft` for the Rust editor's headless CLI/MCP and desktop loopback control bridge, pinned to upstream commit `1fdfd8324db4aa23b08c69f518b086e632f75f84`. Guidance covers project preservation, command discovery, missing-media failures and approved export paths. |
| **Selective setup and catalog** | Registered one new skill (354 → 355) and refreshed README locales, TOON and setup guidance. Installing the skill does not install/build FilmCraft, register MCP, or modify media. Concurrent local skill additions are excluded from this publication. |
| **Verification boundary** | Skill-format validation, catalog search and selective-install dry-run pass. Ten behavioral evaluation fixtures are included; FilmCraft build, GUI/MCP execution, editing and export were not run. |
| **Eleven source-pinned repository operators** | Added `openrig`, `anyjev`, `typesafe-computer-use`, `zurp`, `helix-foundry`, `uzu`, `context-mode`, `rea`, `fineenvs`, `llmfit`, and `pg-jev` as original operating guides with audited commits, primary-source commands, license evidence and explicit side-effect boundaries. This batch extends the published catalog from 355 to 366 skills. |
| **Selective setup and discovery** | Updated English/Korean/Spanish README catalog projections and source references, the setup guide, and meaningful Jev/local-model/context-tool relationships. Catalog installation adds documents only; it does not install upstream applications, download models, register hooks/MCP, use credentials, control a desktop or mutate a database. Context Mode subprocesses are not an OS/security sandbox and its npm postinstall can modify Claude configuration. |
| **Verification boundaries** | Added 44 behavioral evaluation scenarios. Eleven skill documents load with valid frontmatter and the selective-install dry-run resolves all eleven. Upstream runtimes, model quality, desktop actions, live targets and databases were not executed or certified by this documentation change. |

## 🆕 What's New in v2026-10-08

| Change | Details |
|--------|---------|
| **Jev per-operation backend routing** | `route-skills`, `prune-context`, and `review` each resolve their own backend from the profile (`JEV_<OP>_BACKEND` plus an ordered `_FALLBACK` allow-list; setup flags `--route-backend`, `--prune-backend`, `--review-backend`, `--fallback <op>=<kind[,kind]>`). `--backend` / `--model` override one call and `status --operation` reports each chain. Fallback tries only listed kinds and never crosses profiles. |
| **System One backend kind** | New `systemone` mode targets an operator-run System One endpoint with three drivers: TypeSafe-compatible, AutoTrust `serve_decide.py` `/v1/decide` (pure System 1 with `thinking: "off"`), and a vLLM `jev-decision` head read from token logprobs. It downloads and starts nothing. |
| **Attestation-bound tiers** | Every backend is `unvalidated` unless `--validated-model` matches the model it reports serving, and only calibrated decision-head drivers (`api`, `systemone`) can be validated. `review` permits only on a validated tier, so `local`, Ollama, and LM Studio recommend (`proposal_only`) but never authorize. Receipts (v2) bind backend, model, and tier. |
| **Cap-aware skill selection and provider/model policies** | Selection runs gate Nouls, then sharded Choice or a lexical shortlist reranked by fit Nouls, and can answer "no skill fits" explicitly. Optional `skills.json` `model_policies` add advisory per-skill `provider/model` routing (for example `openai/gpt-6.1-sol` or `ollama/qwen2.5:7b`); hosts are not adapted yet. |
| **Fixes** | The hosted `api` request now matches the documented `/v1/systemone` body (`model`, Choice `criteria`, `noul` answers); prune batches are position-keyed and bounded by each backend's state limit; oversized input is rejected before any request instead of being truncated server-side; setup installs a validated catalog snapshot so `route-skills` works outside a checkout, and skill excerpts sent to a backend stay inside the catalog root (`../` and outbound symlinks refused). |
| **Verification** | 52 loopback regressions (also on Python 3.11 + Node 24), 20/20 offline self-test checks, 3 isolated profile tests, CI green on Linux and macOS, and a live isolated-HOME run on Ollama JEV-9B-GGUF: routing from an empty directory over the 354-skill snapshot, `local`→`ollama` prune fallback, and a fail-closed `review --backend local`. The live run proves transport, not calibration (tier `unvalidated`). |

## 🆕 What's New in v2026-10-01

| Change | Details |
|--------|---------|
| **Linux permission preservation** | Fixed Agentation's permission lookup and the configuration regression helper to select BSD or GNU `stat` by platform. The initial Ubuntu CI run exposed filesystem output leaking into a captured mode value; the existing exact-mode preservation checks remain unchanged. |
| **Legacy upgrade and CI coverage** | Added portable, preview-first `install.sh` instructions that bypass old PATH routers, replaced manual native-copy guidance with guarded installation commands, and added regressions for preserving the shared CLI link, executing documented previews without writes, and preserving minimal/core/full selections through GJC/AGY/IDE preview and apply commands. Local checks pass: 34 installer, 6 loader-probe, and 24 configuration-writer tests. CI now runs these gates on main pushes and manual dispatch as well as pull requests, on Linux and macOS. Actual user installations and ECC settings were not changed. |
| **Installation docs: runtime mapping verified** | Updated `setup-all-skills-prompt.md`, `README.md`, `README.ko.md`, `README.es-ES.md`, and `jeo-skill` SKILL.md to clarify accurate runtime support paths and native projection requirements. All 12 installer cases + 7 linked selective installs + 8 actual session loaders passed smoke tests. |
| **Antigravity IDE/CLI paths corrected** | Fixed Antigravity IDE native root to `~/.gemini/config/skills` (legacy `~/.gemini/antigravity/skills` paths preserved, never deleted). Antigravity CLI (`agy`) remains at `~/.gemini/antigravity-cli/skills`. Both require native materialization since `skills@1.7.0` installs to shared root regardless of `--agent` flag; setup guide Step 4C handles this automatically. |
| **OMP → oh-my-pi naming fixed** | Corrected all references from OpenMP to oh-my-pi (the actual runtime name) across all README and installation guide sections. |
| **Native projection reference table added** | The `jeo-skill` guide documents runtime aliases, shared and native roots, installation scope, automatic selected-skill projection, and per-account Aside selection. Native placement is handled by the installer rather than manual copies. |
| **Shared provider and account safety** | Confirmed jeopi/jeo-code/oh-my-pi load shared `.agents/skills` roots; no ECC adapter needed. GJC uses `~/.gjc/agent/skills` globally or `.gjc/skills` in a project. Aside uses account-scoped `~/.aside/u/<id>/skills/user/` paths; credentials are never shared across accounts. |
| **Installation prerequisites validated** | Documentation specifies: Bash 3+, Node.js >= 22.20, and `skills@1.7.0` CLI pinned. Verification scope is honest: no false end-to-end desktop test claims; all guarantees backed by automated installer regression suite. |

## 🆕 What's New in v2026-09-22

| Change | Details |
|--------|---------|
| **Stagehand browser-agent skill** | Added `stagehand` for the pinned `browserbase/stagehand` v4 SDK and `browse` CLI: local, Browserbase, and CDP browser selection; `act` / `observe` / `extract`; typed WebMCP; Search/Fetch; Playwright route-outs; a read-only preflight; evals; and pinned upstream evidence. |
| **On-demand runtime boundary** | Updated the setup guide to keep SDK, CLI, Chromium, Browserbase MCP, credentials, and paid cloud services out of blanket installation. `agent-browser` was not present in the current tree or manifest, so no deletion was required. |

## 🆕 What's New in v2026-09-19

| Change | Details |
|--------|---------|
| **Nine duplicate skills merged (359 → 350)** | A full-catalog duplicate audit (explicit alias markers, TF-IDF over descriptions and bodies, trigger overlap, and a manual same-job pass) found nine pairs doing the same job. Each was merged, never just deleted: the canonical skill absorbed the duplicate's unique content and trigger phrases, the folder was removed, and the old name went into `skills.json` `retired_skills` so `jeo-skill install <old-name>` answers with the replacement. Pure aliases: `agent-development-principles` → `agent-principles`, `remotion-video-production` → `video-production` (which also got its three long-missing `references/` files restored from `108fbaa^` plus `remotion-route-outs.md`), `higgsfield-game-generation` → `higgsfield-websites` (drift auditor now at `references/game-alias/`). oh-my-gods wrappers folded into the official skills: `deepagents` → `deep-agents-core` (`references/quickstart-and-backends.md`), `langgraph-workflow` → `langgraph-fundamentals` (`references/production-patterns.md`), `mcp-server-design` → `mcp-builder` (`references/server-card-and-registry.md`). pm-skills templates folded into the routing-first canonicals: `retro` → `sprint-retrospective` (Sailboat prompt family, compact sprint summary), `release-notes` → `changelog-maintenance` (technical → user-facing rewrite table), `sprint-plan` → `task-planning` (`references/sprint-planning-recipe.md`). Every route-out in other skills that named a merged skill was repointed. |
| **Three routing groups instead of merges** | Skills that overlap but are not the same job are now declared rather than duplicated: `llm-observability` (`agent-observability` platform-neutral layer → `langsmith` / `opik` operators → `monitoring-observability`), `bug-diagnosis` (`log-analysis` → `debugging` → `diagnosing-bugs`, and `debugging` now routes hard/flaky HITL hunts to `diagnosing-bugs`), `product-analytics` (`data-analysis` → `ab-test-analysis` / `cohort-analysis` → `looker-studio-bigquery`). Upstream sibling splits inside vendored families (pm-skills, mattpocock, langchain-skills) and provider choices (`aura-asset-images` / `unsplash-asset-images`) were deliberately left alone. |

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
