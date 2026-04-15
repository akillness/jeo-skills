# Agent Skills

<div align="center">

[![Skills](https://img.shields.io/badge/Skills-89-blue?style=for-the-badge)](https://github.com/akillness/oh-my-skills)
[![Platform](https://img.shields.io/badge/Platform-Claude%20%7C%20Gemini%20%7C%20Codex%20%7C%20OpenCode-orange?style=for-the-badge)](https://github.com/akillness/oh-my-skills)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![BMAD](https://img.shields.io/badge/BMAD-1.2.0-purple?style=for-the-badge)](docs/bmad/README.md)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

**89 AI agent skills · TOON Format · Cross-platform**

[Quick Start](#-quick-start) · [Skills List](#-skills-list) · [Installation](#-installation) · [한국어](README.ko.md)

</div>

---

## 💡 What is Agent Skills?

**89 AI agent skills · TOON Format · Cross-platform**

Agent Skills is a curated collection of 89 AI agent skills for LLM-based development workflows. Built around the `jeo` orchestration protocol, it provides:
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
curl -s https://raw.githubusercontent.com/akillness/oh-my-skills/main/setup-all-skills-prompt.md
```

| Platform | First Command |
|----------|--------------|
| Claude Code | `jeo "task description"` or `/omc:team "task"` |
| Gemini CLI | `/jeo "task description"` |
| Codex CLI | `/jeo "task description"` |
| OpenCode | `/jeo "task description"` |

---

## 🏗 Architecture

```mermaid
graph TD
    JEO["🎯 JEO\nCore Orchestration"] --> PLAN["📋 PLAN\nralph + plannotator"]
    JEO --> EXEC["⚡ EXECUTE\nteam / bmad"]
    JEO --> VERIFY["🔍 VERIFY\nagent-browser"]
    JEO --> UI["🎨 VERIFY_UI\nagentation"]
    JEO --> CLEAN["🧹 CLEANUP\nworktree"]

    PLAN --> OMC["omc\nClaude Code"]
    PLAN --> OHMG["ohmg\nGemini CLI"]
    PLAN --> OMX["omx\nCodex CLI"]

    SURVEY["🔭 survey"] -.-> JEO
    RALPH["🔄 ralph"] -.-> EXEC
    AUTORESEARCH["🔬 autoresearch"] -.-> EXEC
```

---

## 🆕 What's New in v2026-04-15

| Change | Details |
|--------|---------|
| **agent-browser: fresh-session verification rewrite** | Reframed `agent-browser` from a generic browser CLI guide into the browser-review lane's **fresh-session deterministic verification** anchor. It now chooses the clean browser lane first, enforces an observe → act → observe loop, makes route-outs explicit to `playwriter`, `agentation`, and `plannotator`, adds `references/modes-and-routing.md` plus `evals/evals.json`, and keeps auth reuse bounded instead of silently sliding into a running-browser workflow. |
| **agentation: UI annotation router rewrite** | Reframed `agentation` from a monolithic install/config catalog into the planning-review lane's exact rendered-UI feedback router. It now chooses among copy-paste review, synced watch-loop, self-driving critique, and platform-setup modes; keeps route-outs explicit to `agent-browser`, `playwriter`, and `plannotator`; adds `references/modes-and-routing.md`, `references/platform-setup-and-hooks.md`, `references/watch-loop-and-self-driving.md`, and `evals/evals.json`; and fixes top-level discovery surfaces so the repo now consistently advertises **89 skills**. |
| **git-submodule: submodule-operator rewrite** | Reframed `git-submodule` from a legacy command catalog into the utilities lane's decision-first submodule anchor. It now decides between submodule vs subtree/vendoring/package delivery first; chooses one workflow mode (`boundary decision`, `add-and-pin`, `bootstrap-and-clone`, `sync-to-pinned-commit`, `advance-tracked-branch`, `edit-inside-submodule`, `remove-and-cleanup`, or `ci-checkout`); makes detached-HEAD, pointer, and CI/auth consequences explicit; routes generic history cleanup to `git-workflow` and package delivery to `npm-git-install`; and ships `references/decision-matrix.md`, `references/update-and-detached-head.md`, `references/ci-and-automation.md`, and `evals/evals.json` without increasing the skill count. |
| **bmad-idea: pre-planning concept-router rewrite** | Reframed `bmad-idea` from a legacy BMAD-CIS command/persona catalog into the repository's pre-planning idea router. It now normalizes early-stage product, GTM, consulting, and game packets; chooses one framing mode (`problem framing`, `audience and value framing`, `concept shaping`, `game concept framing`, or `story packaging`); produces one reusable concept artifact; routes cleanly to `bmad`, `task-planning`, `marketing-automation`, or `bmad-gds`; and ships `references/operating-modes.md`, `references/handoff-boundaries.md`, `references/concept-packet-template.md`, and `evals/evals.json` without increasing the skill count. |
| **genkit: full-stack AI workflow rewrite** | Reframed `genkit` from a long command/example dump into the Firebase/fullstack lane's **backend AI workflow anchor**. It now chooses among flow-foundation, tool-and-agent, retrieval-and-prompt, evaluation-and-observability, and deployment-runtime modes; keeps direct Firebase app/client SDK work routed to `firebase-ai-logic`; adds `references/modes-and-routing.md`, `references/deployment-and-runtime-boundaries.md`, `references/evals-and-observability.md`, and `evals/evals.json`; and updates discovery surfaces so Genkit is positioned as the reusable server-owned workflow layer rather than a generic snippet catalog. |

## 🆕 What's New in v2026-04-14

| Change | Details |
|--------|---------|
| **npm-git-install: Git-dependency decision rewrite** | Reframed `npm-git-install` from a legacy npm-only command dump into a decision-first Node package delivery skill. It now chooses between direct Git install, SHA-pinned bridge installs, private Git auth, tarball / `npm pack` artifacts, workspace / `file:` links, and publish-first registry paths; covers npm, pnpm, Yarn, and Bun at the workflow level; adds explicit auth/build/reproducibility guardrails and route-outs to `git-workflow`, `github-repo-management`, `workflow-automation`, and `system-environment-setup`; and ships `references/delivery-decision-matrix.md`, `references/package-manager-behavior.md`, `references/private-auth-and-ci.md`, and `evals/evals.json` without increasing the skill count. |
| **web-design-guidelines: UI-audit rewrite** | Reframed `web-design-guidelines` from a thin Vercel-rules fetcher into the frontend cluster's broad interface audit anchor for launch-readiness, polish/consistency, flow-friction, heuristic, and rule-overlay reviews. It now classifies findings across hierarchy, clarity, states, responsiveness basics, accessibility basics, and performance/trust signals; adds explicit route-outs to `web-accessibility`, `responsive-design`, `ui-component-patterns`, `design-system`, and `react-best-practices`; and ships `references/review-modes-and-categories.md`, `references/handoff-boundaries.md`, `references/ui-audit-packet-template.md`, and `evals/evals.json` without increasing the skill count. |
| **monitoring-observability: telemetry-review rewrite** | Reframed `monitoring-observability` from a generic Prometheus/logging snippet dump into a mode-selecting observability anchor for service reliability, telemetry foundations, data/marketing pipeline health, game live-ops visibility, and stack-review audits. It now applies symptom-first alerting, explicit dashboard/ownership checks, and route-outs to `log-analysis`, `debugging`, `performance-optimization`, `langsmith`, `deployment-automation`, and `game-performance-profiler`; and ships `references/modes-and-boundaries.md`, `references/alert-dashboard-checklist.md`, `references/telemetry-rollout-matrix.md`, and `evals/evals.json` without increasing the skill count. |
| **performance-optimization: bottleneck-workflow rewrite** | Reframed `performance-optimization` from a generic React/database optimization dump into the code-quality cluster's measurement-led tuning anchor. It now classifies interaction, page-load, API, DB, capacity, memory, and runtime bottleneck modes; chooses the right evidence source before proposing fixes; adds route-outs to `monitoring-observability`, `debugging`, `code-refactoring`, `testing-strategies`, and `game-performance-profiler`; and ships `references/tuning-modes.md`, `references/handoff-boundaries.md`, `references/measurement-checklist.md`, and `evals/evals.json` without increasing the skill count. |
| **code-refactoring: behavior-preserving rewrite** | Reframed `code-refactoring` from a long textbook pattern dump into the code-quality cluster's structure-improvement anchor. It now chooses between local safe refactors, behavior-freeze-first cleanup, and repetitive migration / codemod work; keeps tests, search, and reviewable slices explicit; adds route-outs to `debugging`, `code-review`, `testing-strategies`, `performance-optimization`, and `codebase-search`; and ships `references/refactor-modes.md`, `references/handoff-boundaries.md`, `references/safe-refactor-checklist.md`, and `evals/evals.json` without increasing the skill count. |
| **changelog-maintenance: release-history rewrite** | Reframed `changelog-maintenance` from a generic semver/example dump into the documentation cluster's release-history / release-notes anchor. It now selects among changelog, release-notes, migration-update, and game-patch-note workflows; adds route-outs to `technical-writing`, `api-documentation`, `user-guide-writing`, `deployment-automation`, and `marketing-automation`; and ships `references/automation-and-source-of-truth.md`, `references/modes-and-boundaries.md`, `references/release-note-quality-checklist.md`, and `evals/evals.json` without increasing the skill count. |

## 🆕 What's New in v2026-04-13

| Change | Details |
|--------|---------|
| **responsive-design: layout-adaptation rewrite** | Reframed `responsive-design` from a long generic CSS example dump into the frontend cluster's mobile-first, container-aware layout adaptation skill. It now classifies viewport-vs-container failures, prioritizes intrinsic layout before breakpoint sprawl, adds explicit route-outs to `ui-component-patterns`, `web-accessibility`, `design-system`, and `web-design-guidelines`, and ships `references/layout-decision-checklist.md`, `references/handoff-boundaries.md`, and `evals/evals.json` without increasing the skill count. |

## 🆕 What's New in v2026-04-12

| Change | Details |
|--------|---------|
| **bmad: core BMAD router modernization** | Reframed `bmad` into the portable BMAD/BMM core router: it now chooses project level, identifies the current phase, recommends one next artifact, and routes runtime-specific or specialist depth to `plannotator`, `task-planning`, `omc`, `omx`, `ohmg`, or `bmad-gds` instead of acting like a giant command dump. Added `references/core-routing.md`, `references/status-and-review.md`, `references/runtime-and-module-boundaries.md`, and `evals/evals.json`, while keeping the existing helper scripts. |
| **bmad-gds: game producer/orchestration rewrite** | Reframed `bmad-gds` from a generic phase catalog into a practical game-production coordination skill. It now acts as the repo's game-cluster orchestrator: normalizes mixed packets (idea, GDD, playtest notes, bug/build issues, launch targets), chooses one operating mode, produces one milestone-aware coordination brief, and routes detailed work to `game-demo-feedback-triage`, `game-build-log-triage`, `game-performance-profiler`, `steam-store-launch-ops`, `task-planning`, or `bmad-idea` as needed. Added `references/operating-modes.md`, `references/scope-boundaries.md`, and `evals/evals.json` without increasing the skill count. |

## 🆕 What's New in v2026-04-08

| Change | Details |
|--------|---------|
| **graphify: repo and corpus knowledge-graph skill** | Added a dedicated `graphify` skill for turning repositories or mixed corpora into persistent knowledge-graph artifacts with `GRAPH_REPORT.md`, `graph.json`, and HTML visualization. Covers the tested Python API pipeline, graph queries, graph-backed architecture discovery, and assistant install flows; includes `references/overview.md` and `evals/evals.json`. 84 → **85 skills**. |
| **llm-wiki: persistent LLM-maintained markdown wiki skill** | Added a dedicated `llm-wiki` skill for turning raw sources into a compounding Obsidian or markdown knowledge base. It bootstraps a vault with `raw/`, `wiki/`, `index.md`, `log.md`, and `AGENTS.md`; ships helper scripts for bootstrap, Scrapling-powered URL ingest, query filing, and linting; and pushes schema, ingest, filing, and scaling detail into focused references. Includes `evals/` plus `skill-autoresearch-llm-wiki/` baseline, changelog, results, and dashboard artifacts. 82 → **83 skills**. |
| **rtk: Rust Token Killer setup and operations skill** | Added a dedicated `rtk` skill for installing, verifying, and initializing Rust Token Killer across Claude Code, Codex, Gemini CLI, Cursor, Copilot, Windsurf, Cline, and OpenCode. The skill starts with `rtk gain` verification, handles the common wrong-package collision, ships install/init/status wrapper scripts, and pushes deeper platform and troubleshooting details into focused reference docs. Includes `evals/` plus `skill-autoresearch-rtk/` baseline, changelog, results, and dashboard artifacts. 81 → **82 skills**. |

## 🆕 What's New in v2026-03-30

| Change | Details |
|--------|---------|
| **harness: agent team & skill architect meta-skill** | Added a dedicated `harness` skill for designing domain-specific agent teams and generating the skills they use. Covers domain analysis, architecture pattern selection (pipeline, fan-out/fan-in, expert pool, producer-reviewer, supervisor, hierarchical delegation), `.claude/agents/` and `.claude/skills/` file generation, orchestration workflow definition, and validation with trigger evals and dry-run testing. Includes `install.sh`, `validate-harness.sh` scripts, and 5 reference docs. 80 → **81 skills**. |

## 🆕 What's New in v2026-03-28

| Change | Details |
|--------|---------|
| **obsidian-cli: terminal automation for Obsidian** | Added a dedicated `obsidian-cli` skill for enabling and operating the official Obsidian CLI: installer and registration preflight, TUI vs one-shot usage, `vault=` / `file=` / `path=` targeting, `--copy`, everyday note workflows, plugin and theme control, developer commands like `plugin:reload` and `dev:screenshot`, plus platform troubleshooting references. 79 → **80 skills**. |
| **scrapling: adaptive web scraping skill** | Added a dedicated `scrapling` skill for parser-first HTML extraction, fetcher selection (`Fetcher` → `DynamicFetcher` → `StealthyFetcher`), extras-aware installation, adaptive selector recovery, CLI extraction, and second-tier MCP/spider guidance. The implementation includes install/extract/MCP wrapper scripts plus focused references for fetchers, parser behavior, CLI/MCP, and spiders. 78 → **79 skills**. |
| **strix: AI-driven application security testing skill** | Added a dedicated `strix` skill for operating the Strix CLI end-to-end: install and Docker preflight, `STRIX_LLM` provider setup, local/GitHub/live target scans, quick/standard/deep mode selection, headless CI/CD usage, and clear separation between this repo's skill and Strix internal security skills. 77 → **78 skills**. |

## 🆕 What's New in v2026-03-22

| Change | Details |
|--------|---------|
| **bmad-orchestrator renamed to bmad** | `bmad-orchestrator` skill folder renamed to `bmad`. Simplified to core BMAD workflow orchestration (Analysis → Planning → Solutioning → Implementation). Use keyword `bmad` as before. |
| **Removed copilot-coding-agent** | `copilot-coding-agent` skill removed. 77 skills total. |

## 🆕 What's New in v2026-03-19

| Change | Details |
|--------|---------|
| **clawteam: agent swarm coordination skill** | Added a dedicated `clawteam` skill for framework-agnostic multi-agent orchestration with tmux-backed workers, git worktree isolation, file-based task/inbox state, monitoring commands, and reusable templates for full-stack, ML research, and hedge-fund style teams. |
| **obsidian-plugin: Obsidian plugin development skill** | Build, validate, and publish Obsidian plugins. Covers all 27 `eslint-plugin-obsidianmd` rules, interactive boilerplate generator (`create-plugin.js`), memory management, type safety, accessibility (MANDATORY), CSS variables, vault API, and community submission validation. 75 → **76 skills**. |
| **jeo v1.6.0: `.jeo` planning ledger flow** | JEO now creates a project-local `.jeo/` folder and uses it as a durable planning/development/QA ledger: `long-term.md`, `short-term.md`, `planned.md`, `progress.md`, `history.md`, plus queued/active task files. Completed task files are summarized into history then removed; follow-up work can be queued without resetting the workflow. |
| **skill-autoresearch: eval-driven skill optimization** | New skill for improving an existing `SKILL.md` with binary evals, mutation loops, baseline scoring, and dashboard/changelog artifacts. Keeps the original `autoresearch` ML workflow separate. 76 → **77 skills**. |
| **firebase-cli: Firebase CLI skill** | Full Firebase CLI (firebase-tools) coverage — deploy, emulate, import/export, manage users, CI/CD. 74 → **75 skills**. |
| **google-workspace, langsmith, react-grab added** | 3 new skills: Google Workspace REST API automation, LangSmith LLM observability/evaluation, react-grab React element context capture. 71 → **74 skills**. |
| **research-paper-writing: ML/CV/NLP paper writing skill** | Academic paper composition for Abstract, Introduction, Method, Experiments, Conclusion. Paragraph flow, claim-evidence alignment, pre-submission review. From Prof. Peng Sida's notes. 70 → **71 skills**. |
| **Removed ai-tool-compliance and llm-monitoring-dashboard** | Removed `ai-tool-compliance` (internal compliance automation) and `llm-monitoring-dashboard`. 72 → **70 skills**. |
| **Removed deprecated agent-development skills** | Removed `agent-configuration`, `agent-evaluation`, `agentic-development-principles`, `agentic-principles`, `agentic-workflow`. 80 → **72 skills**. |
| **Removed deprecated image/media skills** | Removed `image-generation`, `image-generation-mcp`, `pollinations-ai`. Use `video-production` as the canonical programmable-video skill; `remotion-video-production` remains as the compatibility alias for explicit Remotion naming. |
| **autoresearch: Karpathy autonomous ML experiment skill** | AI agent modifies `train.py`, runs 5-min GPU experiments, evaluates with `val_bpb`, ratchets improvements via git. Includes `scripts/` and `references/`. |
| **jeo v1.2.3: plannotator-plan-loop.sh all-platform hardening** | Cross-platform temp dir fallback, dedicated port `PLANNOTATOR_PORT=47291`, `probe_plannotator_port()` + `wait_for_listen()`, browser-crash retry up to 3 times, structured `jeo-blocked.json` output. |
| **survey: cross-platform landscape scan** | 4-lane discovery flow, artifacts to `.survey/{slug}/`, Claude/Codex/Gemini abstraction as `settings/rules/hooks`, plus an explicit evidence-recovery ladder for broken search/extract runs. |
| **presentation-builder: deck artifact workflow** | Slides-grab-based deck planning for investor / roadmap / launch / architecture-demo / workshop / game-pitch decks, with browser review and PPTX/PDF handoff. Removed duplicate `pptx-presentation-builder`. |

---

## 📦 Installation

### Step 0: Install `skills` CLI

```bash
npm install -g skills
skills --version
```

### For LLM Agents

```bash
curl -s https://raw.githubusercontent.com/akillness/oh-my-skills/main/setup-all-skills-prompt.md
```

### Choose by Platform

#### Claude Code

```bash
npx skills add https://github.com/akillness/oh-my-skills \
  --skill jeo --skill omc --skill plannotator --skill agentation \
  --skill ralph --skill ralphmode --skill vibe-kanban
```

#### Gemini CLI

```bash
npx skills add https://github.com/akillness/oh-my-skills \
  --skill jeo --skill ohmg --skill ralph --skill ralphmode --skill vibe-kanban
gemini extensions install https://github.com/akillness/oh-my-skills
```

#### Codex CLI

```bash
npx skills add https://github.com/akillness/oh-my-skills \
  --skill jeo --skill omx --skill ralph --skill ralphmode
```

#### Platform-Specific Setup

```bash
# Claude Code — jeo hook setup
bash ~/.agent-skills/jeo/scripts/setup-claude.sh

# Gemini CLI — jeo hook setup
bash ~/.agent-skills/jeo/scripts/setup-gemini.sh

# oh-my-claudecode
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/oh-my-claudecode:omc-setup
```

---

## 📚 Skills List

> Full manifest: `.agent-skills/skills.json` · each folder's `SKILL.md` · 89 local skill folders = 89 total installable skills

### 🎯 Core Orchestration (11)

| Skill | Keyword | Platform | Description |
|-------|---------|----------|-------------|
| `jeo` | `jeo`, `annotate` | All | Integrated orchestration with `.jeo` ledger: Planning→Development→QA→Cleanup |
| `omc` | `omc`, `autopilot`, `ralph`, `ulw`, `ccg`, `deep interview`, `deslop`, `cancelomc` | Claude | 29+ agent orchestration layer (v4.9.3) — Teams/Autopilot/Ralph/Ultrawork/CCG modes, smart model routing, skill layers, real-time HUD |
| `harness` | `harness`, `build a harness` | All | Meta-skill: design domain-specific agent teams, generate `.claude/agents/` + `.claude/skills/` files, validate harness |
| `omx` | `omx`, `$plan`, `$ralph`, `$team`, `$deep-interview`, `$ralplan` | Codex | Multi-agent workflow layer for Codex CLI (v0.11.10) — 30+ agents, 35+ skills, tmux team runtime, omx explore/sparkshell |
| `ohmg` | `ohmg`, `oh-my-agent`, `oma`, `.agents` | Gemini | Gemini / Antigravity entry for the portable `oh-my-agent` harness (`.agents` source of truth, native Gemini projection, cross-vendor-ready layout) |
| `ralph` | `ralph`, `ooo` | All | Ouroboros specification-first + persistent completion loop |
| `ralphmode` | `ralphmode` | All | Automation permission profiles (sandbox-first, repo boundary) |
| `bmad` | `bmad`, `workflow-init`, `workflow-status` | All | Portable BMAD/BMM core router — choose project level, identify the current phase, recommend the next artifact, and route runtime-specific depth outward |
| `bmad-gds` | `bmad-gds` | All | Game-production orchestrator — turn ideas, GDDs, playtest notes, bugs, and launch beats into one milestone-aware next artifact |
| `bmad-idea` | `bmad-idea` | All | Pre-planning idea router — turn rough product, GTM, consulting, or game ideas into one concept artifact and the next handoff |
| `survey` | `survey` | All | Pre-implementation landscape scan |

### 📋 Planning & Review (5)

| Skill | Keyword | Description |
|-------|---------|-------------|
| `plannotator` | `plan` | Visual approval gate for agent plans/diffs — annotate, approve, request changes, or save reviewed plans |
| `agentation` | `annotate` | Exact rendered-UI feedback router — choose copy-paste review, watch-loop sync, self-driving critique, or platform setup |
| `agent-browser` | `agent-browser` | Fresh-session browser verification anchor — clean disposable browser, snapshot refs, and explicit before/after evidence |
| `playwriter` | `playwriter` | Running-browser automation for authenticated Chrome sessions and MCP browser reuse |
| `vibe-kanban` | `kanbanview` | Coding-task board/workspace control plane for parallel agents, review queues, worktree isolation, and PR handoff |

### 🤖 Agent Development (2)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `prompt-repetition` | LLM accuracy via prompt repetition technique | All |
| `skill-standardization` | Validate SKILL.md, canonicalize duplicates, and keep catalog + compact discovery surfaces in sync | All |

### ⚙️ Backend (5)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `api-design` | Contract-first REST/GraphQL API design, compatibility review, and handoff | All |
| `api-documentation` | Developer-facing API docs anchor for reference portals, quickstarts, SDK/webhook guides, truthful examples, and auth/error guidance | All |
| `authentication-setup` | Product-auth setup routing across hosted/framework-native/platform-native auth, sessions/JWTs, org data, and enterprise SSO handoff | All |
| `backend-testing` | Backend coverage planning for API, integration, contract, fixture, and CI-vs-local test layers | All |
| `database-schema-design` | Storage-model and migration-safety design for relational/document schemas, constraints, indexes, and staged schema evolution | All |

### 🎨 Frontend (10)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `design-system` | Canonical frontend UI-system skill for design tokens, page hierarchy, motion, and accessibility-aware visual systems | All |
| `frontend-design-system` | Compatibility alias for `design-system` when legacy tooling or exact-name workflows still expect the old name | All |
| `react-best-practices` | Canonical React & Next.js performance audits for waterfalls, bundle size, RSC, hydration, and rerender issues | All |
| `react-grab` | Browser element context capture — point at UI element, copy React component name, file path, HTML to clipboard for AI agents | All |
| `vercel-react-best-practices` | Compatibility alias for `react-best-practices` when legacy tooling or exact-name workflows still expect the Vercel variant | Claude · Gemini · Codex |
| `responsive-design` | Mobile-first, container-aware layout adaptation plus overflow/reflow verification guidance | All |
| `state-management` | React state-boundary decisions across Context, Zustand, Redux Toolkit, Jotai, and TanStack Query | All |
| `ui-component-patterns` | Reusable primitive / variant / slot API design for shared frontend components | All |
| `web-accessibility` | Accessibility audit/remediation plus manual-vs-automated verification guidance | All |
| `web-design-guidelines` | Broad web UI audit for hierarchy, clarity, consistency, states, responsiveness basics, and accessibility basics | All |

### 🔍 Code Quality (5)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `code-refactoring` | Behavior-preserving structural cleanup, decomposition, duplication removal, and codemod planning | All |
| `code-review` | Workflow-aware diff / PR review for correctness, risk, and missing evidence | All |
| `debugging` | Reproduce → isolate → verify debugging for regressions and flaky failures | All |
| `performance-optimization` | Measurement-led bottleneck analysis and tuning across latency, throughput, memory, bundle, and frame-budget work | All |
| `testing-strategies` | Risk-based validation policy, merge/release gates, flaky-suite policy | All |

### 🏗 Infrastructure (13)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `deployment-automation` | Release-execution anchor for preview/staging/prod promotion, rollout strategy, post-deploy verification, and rollback planning; routes CI authoring to `workflow-automation` and machine setup to `system-environment-setup` | All |
| `environment-setup` | App-config compatibility skill for `.env` layout, env precedence, validation, and secret handoff; routes broader runnable-machine setup to `system-environment-setup` | All |
| `firebase-ai-logic` | Direct Firebase app/client SDK lane for Gemini-powered features, streaming, structured output, and App Check-aware in-app integration; routes backend orchestration to `genkit` | Claude · Gemini |
| `firebase-cli` | Firebase CLI (firebase-tools) — deploy Hosting, Functions, Firestore, Realtime DB, Storage, Extensions, Emulator Suite | All |
| `genkit` | Full-stack AI workflow layer for server-owned flows, tool calling, prompt files, RAG, evaluation, observability, and deployment to Firebase / Cloud Run; routes direct app SDK work to `firebase-ai-logic` | Claude · Gemini |
| `looker-studio-bigquery` | Looker Studio + BigQuery dashboards | All |
| `monitoring-observability` | Telemetry design/review for services, pipelines, alerts, dashboards, and live-ops visibility | All |
| `scrapling` | Adaptive web scraping with parser-first `Selector`, HTTP/browser/stealth fetchers, CLI extraction, and optional MCP/spider workflows | All |
| `rtk` | Rust Token Killer installation and agent setup - `rtk gain` verification, package-collision repair, agent-specific `rtk init`, and direct compact shell wrappers | All |
| `security-best-practices` | Layered web/API hardening for headers, CSP, cookies/CSRF, abuse controls, secrets, and verification handoffs | All |
| `strix` | Strix CLI for AI-driven application security testing - Docker preflight, LLM provider setup, local/GitHub/live target scans, scan modes, and CI/CD usage | All |
| `system-environment-setup` | Canonical broader environment-setup skill for runnable repos, toolchains, Docker/devcontainers, local services, onboarding, and setup drift diagnosis | All |
| `vercel-deploy` | Vercel-specific deploy operations for preview/prod deploys, preview promotion, aliases/domains, env sync, and rollback checks | All |

### 📝 Documentation (5)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `changelog-maintenance` | Release-history + release-notes anchor for changelogs, migration updates, and patch notes | All |
| `presentation-builder` | Deck artifact anchor for investor / roadmap / launch / architecture-demo / workshop / game-pitch decks, with slides-grab review and PPTX/PDF handoff | All |
| `research-paper-writing` | ML/CV/NLP academic paper writing — Abstract, Introduction, Method, Experiments, Conclusion; claim-evidence alignment, pre-submission review | All |
| `technical-writing` | Internal technical docs anchor for specs, architecture docs, ADRs, runbooks, migration guides, and developer-facing implementation notes | All |
| `user-guide-writing` | User-facing docs anchor for onboarding guides, tutorials, how-to articles, FAQs, help-center content, and release-facing help updates | All |

### 📊 Project Management (4)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `sprint-retrospective` | Sprint retros, milestone postmortems, async/hybrid facilitation, and action follow-through | All |
| `standup-meeting` | Daily standups, async check-ins, walk-the-board syncs, and blocker triage | All |
| `task-estimation` | Story points, t-shirt sizing, planning poker prep, and forecast-safe sizing | All |
| `task-planning` | Execution-ready backlog grooming, task slicing, and sprint-prep planning | All |

### 🔭 Search & Analysis (7)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `autoresearch` | Autonomous ML experiments (Karpathy) — AI agent runs overnight GPU experiments, ratchets improvements via git | All |
| `skill-autoresearch` | Eval-driven optimization loop for improving an existing SKILL.md without replacing the ML-focused `autoresearch` workflow | All |
| `codebase-search` | Evidence-first repo navigation, call-site tracing, and impact analysis | All |
| `data-analysis` | Decision-first dataset analysis for exports, experiments, telemetry, and KPI explanation | All |
| `langsmith` | LLM observability, tracing, evaluation, and prompt management via LangSmith | All |
| `log-analysis` | Root-cause triage for application, infrastructure, browser, and CI logs | All |
| `pattern-detection` | Mode-selecting pattern/rule hunting for code, logs, telemetry, and metric anomalies | All |

### 🎬 Creative Media (2)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `remotion-video-production` | Compatibility alias for `video-production` when legacy tooling or explicit Remotion naming still expects the old skill | All |
| `video-production` | Canonical programmable-video / automated-video production skill for Remotion, template APIs, content repurposing, and QA handoffs | All |

### 📢 Marketing (2)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `marketing-automation` | Canonical general marketing router — KPI-aware brief + lane selection across CRO, copy, SEO, analytics, growth | All |
| `marketing-skills-collection` | Compatibility alias for `marketing-automation` in legacy prompt packs and catalogs | All |

### 🎮 Game Development (5)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `game-build-log-triage` | Unity/Unreal build, cook, package, editor, signing, and CI log triage — isolate the first actionable engine/build failure | All |
| `game-ci-cd-pipeline` | Game CI/CD design and hardening — build matrices, artifact flow, cache policy, packaging stages, and release gates | All |
| `game-demo-feedback-triage` | Turn playtest/demo/community feedback into weighted themes, fix-first priorities, and explicit handoffs | All |
| `game-performance-profiler` | Frame-time / hitch / memory / CPU-GPU bottleneck triage for Unity and Unreal evidence packets | All |
| `steam-store-launch-ops` | Steam store-page, festival, demo, wishlist, and launch-readiness operations | All |

### 🔧 Utilities (11)

| Skill | Description | Platforms |
|-------|-------------|-----------|
| `fabric` | AI prompt patterns — YouTube summaries, document analysis via 200+ Patterns | All |
| `file-organization` | Decision-first repo structure guidance — choose framework defaults vs feature folders, monorepo boundaries, docs taxonomy, or engine-aware game layouts | All |
| `git-submodule` | Decision-first Git submodule workflow — choose submodule vs subtree/vendor, bootstrap recursively, advance pointers safely, and wire CI checkout/auth | All |
| `git-workflow` | Local Git branch, commit, rebase, conflict, push-safety, and recovery workflows | All |
| `google-workspace` | Google Workspace REST API automation — Docs, Sheets, Slides, Drive, Gmail, Calendar, Chat, Forms, Admin SDK, Apps Script | All |
| `llm-wiki` | Persistent markdown wiki maintenance for Obsidian or git-tracked vaults — raw sources, source summaries, query filing, lint passes, and optional Scrapling/qmd helpers | All |
| `npm-git-install` | Decision-first Git dependency workflow for npm / pnpm / Yarn / Bun — choose Git ref, tarball, workspace, or publish-first path safely | All |
| `obsidian-cli` | Operate the official Obsidian CLI — enablement, TUI, note and task automation, vault and file targeting, plugin reload, developer commands | All |
| `obsidian-plugin` | Obsidian plugin development — 27 ESLint rules, boilerplate generator, accessibility, submission validation | All |
| `opencontext` | Project/repo memory and cross-agent handoff with OpenContext — searchable decisions, manifests, stable links, and load→search→store workflows | All |
| `workflow-automation` | Repo-scoped recurring workflow automation — task runners, bootstrap entrypoints, local-CI parity, hooks, and maintenance routines | All |

---

## 🧬 TOON Format Injection

TOON (Token-Oriented Object Notation) compresses the skill catalog and auto-injects it into every prompt. **40-50% token savings** vs JSON/Markdown.

| Platform | File | Mechanism |
|----------|------|-----------|
| Claude Code | `~/.claude/hooks/toon-inject.mjs` | `UserPromptSubmit` hook — 26-37ms |
| Gemini CLI | `~/.gemini/hooks/toon-skill-inject.sh` | `includeDirectories` session load |
| Codex CLI | `~/.codex/skills-toon-catalog.toon` | Static catalog |

- **Tier 1** (always): Skill catalog index (~875-3,500 tokens) — names + descriptions + tags
- **Tier 2** (on-demand): Individual SKILL.toon content (~292 tokens/skill, max 3)

---

## 🔮 Featured Tools

### jeo — Integrated Agent Orchestration
> Keyword: `jeo` · `annotate` | Platforms: Claude · Codex · Gemini · OpenCode

Complete automated pipeline: Plan (ralph+plannotator) → Execute (team/bmad) → Verify (agent-browser) → UI Feedback (agentation) → Cleanup.

JEO now also maintains a project-local `.jeo/` ledger so the workflow has durable long-term rules, short-term system/test plans, queued work, live progress notes, and append-only history across sessions.

| Phase | Tool | Description |
|-------|------|-------------|
| Plan / Planning | ralph + plannotator + `.jeo/short-term.md` | Visual plan review plus system/unit/flow test planning |
| Execute / Development | omc team / bmad + `.jeo/tasks/active/*.md` | Parallel agent execution with active work-item tracking |
| Verify / QA | agent-browser + agentation (`annotate`) | Browser behavior verification, annotation fixes, QA evidence |
| Cleanup | worktree-cleanup.sh | Auto worktree cleanup |

### plannotator — Visual Plan Review
> Keyword: `plan` | [Docs](docs/plannotator/README.md) | [GitHub](https://github.com/backnotprop/plannotator)

Browser UI for annotating AI plans. Approve or send structured feedback in one click. Works with Claude Code, OpenCode, Gemini CLI, and Codex CLI.

```bash
bash scripts/install.sh --all
```

### ralph — Specification-First Development
> Keyword: `ralph`, `ooo` | [Docs](docs/ralph/README.md) | [GitHub](https://github.com/Q00/ouroboros)

Socratic interview → immutable spec → Double Diamond execution → 3-stage verification → loop until passed.

```bash
ooo interview "I want to build a task management CLI"
ooo seed && ooo run && ooo evaluate <session_id>
ooo ralph "fix all failing tests"
```

### vibe-kanban — AI Agent Kanban Board
> Keyword: `kanbanview` | [Docs](docs/vibe-kanban/README.md) | [GitHub](https://github.com/BloopAI/vibe-kanban)

Board/workspace control plane for bounded coding tasks: run parallel AI agents in isolated worktrees, keep human review explicit, and hand off cleanly to PRs.

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
├── .agent-skills/          ← 89 skill folders (each with SKILL.md + SKILL.toon)
├── docs/                   ← detailed guides (bmad, omc, plannotator, ralph, ...)
├── install.sh
├── setup-all-skills-prompt.md
├── README.md               ← English (this file)
└── README.ko.md            ← 한국어
```

---

## 📖 Related Docs

| Tool | Keyword | Doc |
|------|---------|-----|
| `jeo` | `jeo`, `annotate` | [.agent-skills/jeo/SKILL.md](.agent-skills/jeo/SKILL.md) |
| `plannotator` | `plan` | [docs/plannotator/README.md](docs/plannotator/README.md) |
| `vibe-kanban` | `kanbanview` | [docs/vibe-kanban/README.md](docs/vibe-kanban/README.md) |
| `ralph` | `ralph` | [docs/ralph/README.md](docs/ralph/README.md) |
| `harness` | `harness` | [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md) |
| `omc` | `omc` | [docs/omc/README.md](docs/omc/README.md) |
| `bmad` | `bmad` | [docs/bmad/README.md](docs/bmad/README.md) |
| Harness OSS | — | [docs/harness/README.md](docs/harness/README.md) |

---

## 📎 References

| Component | Source | License |
|-----------|--------|---------|
| `jeo` | Internal | MIT |
| `omc` | [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | MIT |
| `ralph` | [Q00/ouroboros](https://github.com/Q00/ouroboros) | MIT |
| `plannotator` | [plannotator.ai](https://plannotator.ai) | MIT |
| `bmad` | [bmad-dev/BMAD-METHOD](https://github.com/bmad-dev/BMAD-METHOD) | MIT |
| `agentation` | [benjitaylor/agentation](https://github.com/benjitaylor/agentation) | MIT |
| `fabric` | [danielmiessler/fabric](https://github.com/danielmiessler/fabric) | MIT |
| `harness` | [revfactory/harness](https://github.com/revfactory/harness) | Apache-2.0 |
| `obsidian-cli` | [Obsidian CLI Help](https://obsidian.md/help/cli) | Proprietary |
| `llm-wiki` | [karpathy/llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | — |
| `graphify` | [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT |
| `scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 |
| `autoresearch` | Andrej Karpathy methodology | — |
| `research-paper-writing` | [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | — |
| Agent Skills Spec | [agentskills.io](https://agentskills.io/specification) | — |

---

<div align="center">

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/akillness3q)

⭐ If this helps you, star the repository!

```bash
gh api --silent --method PUT /user/starred/akillness/oh-my-skills >/dev/null 2>&1 || true
```

</div>
