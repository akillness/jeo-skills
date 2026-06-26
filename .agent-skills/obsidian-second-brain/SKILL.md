---
name: obsidian-second-brain
description: >
  Routing-first front door for the obsidian-second-brain skill — a self-rewriting
  Obsidian vault that evolves Karpathy's LLM-Wiki pattern. Instead of appending new
  notes, every source REWRITES existing pages: people get updated, claims revised,
  contradictions reconciled, and cross-source patterns synthesized automatically.
  Ships 45 slash commands across 4 layers (Operations, Thinking Tools, Context
  Engine, Research Toolkit), a background agent + 4 scheduled agents, 4 role
  presets, and a write-time AI-first validator. Runs cross-CLI on Claude Code,
  Codex CLI, Gemini CLI, and OpenCode.
  Use when the user wants a knowledge vault that maintains itself, to save/ingest
  meetings/voice/screenshots/URLs into Obsidian, to reconcile contradictions, to
  challenge a decision against their own history, to run vault-first or open-web
  research (X / Perplexity / NotebookLM / YouTube / podcasts), or to install the
  second-brain skill on any of the four CLIs.
  Triggers on: obsidian second brain, second brain, self-rewriting vault, llm wiki,
  obsidian-save, obsidian-ingest, obsidian-reconcile, obsidian-challenge,
  obsidian-architect, vault automation, ingest into obsidian, vault-first research.
  Routes: use `obsidian` for plugin/CLI/URI vault automation, `llm-wiki` for the
  raw markdown wiki layer, `okf` for portable knowledge bundles, `notebooklm` for
  source-grounded NotebookLM queries, `scrapling` for web-content extraction.
allowed-tools: Read Write Edit Bash Grep Glob WebFetch
compatibility: >
  Cross-CLI — one codebase builds dispatchers for Claude Code (CLAUDE.md), Codex
  CLI / OpenCode (AGENTS.md), and Gemini CLI (GEMINI.md). The vault behavior is
  identical across all four; only the install path differs. The 35 core commands
  are pure instruction files and run on any model the host CLI points at (incl.
  open models like Hermes via OpenRouter). The 4 Google Calendar commands are
  Claude Code only (Codex/Gemini/OpenCode builds ship 40). The optional research
  toolkit needs Python 3.10+ (`uv sync`) and API keys (xAI / Perplexity / Gemini /
  YouTube / OpenAI), but `/research` + `/research-deep` fall back to free key-less
  sources when unkeyed. Plugin-installable via `npx skills add`.
metadata:
  tags: obsidian-second-brain, obsidian, second-brain, llm-wiki, knowledge-vault, note-taking, self-rewriting, contradiction-reconciliation, synthesis, research-toolkit, cross-cli, claude-code, codex, gemini, opencode
  platforms: Claude, Codex, Gemini, OpenCode, All
  keyword: obsidian-second-brain
  version: "1.0.0"
  upstream: https://github.com/akillness/obsidian-second-brain
  origin: https://github.com/eugeniughelbur/obsidian-second-brain
  source: akillness/jeo-skills
  license: MIT
---

# obsidian-second-brain

A routing-first front door for [**obsidian-second-brain**](https://github.com/akillness/obsidian-second-brain)
— an evolution of [Karpathy's LLM-Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
into **a vault that rewrites itself**. Where the LLM-Wiki appends new pages, this
skill REWRITES existing ones: people get updated, claims revised, stale facts
replaced, contradictions reconciled automatically, and cross-source patterns
synthesized on their own — while you sleep.

> **Keyword**: `obsidian second brain` · `self-rewriting vault` · `obsidian-save` · `obsidian-ingest`
>
> One codebase, four CLIs (Claude Code · Codex CLI · Gemini CLI · OpenCode), same brain.

## When to use this skill

- The user wants an Obsidian vault that **maintains itself** instead of a static filing cabinet.
- The user wants to **capture work into the vault**: save a conversation, ingest a URL / PDF / audio / screenshot, log a session, create daily notes, track tasks/people/decisions.
- The user wants the vault to **reconcile contradictions** and **synthesize cross-source patterns** automatically.
- The user wants **thinking tools** that push back: challenge a decision against their own history, convene a perspective panel, surface unnamed patterns, bridge unrelated domains.
- The user wants **research pulled into the vault**: deep-read an X post, scan X trends, web research with citations, vault-first deep research, source-grounded NotebookLM synthesis, YouTube/podcast transcripts.
- The user wants to **install** the second-brain skill on Claude Code, Codex CLI, Gemini CLI, or OpenCode (incl. open models like Hermes).
- The user wants to scan a codebase and write **maintained architecture notes** into the vault (`/obsidian-architect`).

Route out when the real job is narrower:

- **`obsidian`** — Obsidian plugin development, CLI automation, URI handoff, JSON Canvas, Bases content patterns.
- **`llm-wiki`** — the underlying raw/wiki markdown layer, source summaries, query filing, lint passes.
- **`okf`** — exporting the vault as a portable, vendor-neutral Open Knowledge Format bundle.
- **`notebooklm`** — standalone source-grounded NotebookLM queries outside a vault workflow.
- **`scrapling`** — adaptive web scraping when you only need raw content extraction, not vault ingestion.

## Instructions

### Step 1 — Classify the request into one of the 4 layers

The skill is organized into four layers plus an always-on automation tier. Pick the layer first, then the command. Full command table in [references/commands.md](references/commands.md).

| Layer | Purpose | Pick when the user wants to… |
|-------|---------|------------------------------|
| **1 · Operations** (28 cmds) | Claude remembers | save, ingest, reconcile, export, daily notes, tasks, people, decisions, calendar, project/vault maintenance, architecture notes |
| **2 · Thinking Tools** (7 cmds) | Claude thinks with you | challenge an idea, convene a panel, surface patterns, bridge domains, deep-synthesize a topic, rank next directions, graduate an idea into a project |
| **3 · Context Engine** (1 cmd) | Claude knows who you are | load identity + state with progressive token budgets (`/obsidian-world`) |
| **4 · Research Toolkit** (7 cmds) | Claude pulls knowledge in | X read/pulse, web research, vault-first deep research, NotebookLM, YouTube, podcast |
| **Always On** | Vault stays alive | background agent (post-compaction) + 4 scheduled agents (morning/nightly/weekly/health) + save reminders |

State the route explicitly before acting, e.g. *"Operations → `/obsidian-ingest`"* or *"Research → `/research-deep` (vault-first)"*.

### Step 2 — Honor the AI-first vault rule on every write

This is the core invariant — it applies on **every** note write, regardless of model:

- Each note opens with a **`## For future Claude`** preamble (what this note is, why it matters, how to use it).
- Frontmatter is for **LLM retrieval**, not human review (type, tags, recency markers, sources verbatim).
- **Rewrite, don't append**: when a source adds depth or contradicts a page, rewrite that page and record why.
- **Bi-temporal facts**: track when a fact was true AND when the vault learned it ("You believed X on Tuesday; after ingesting Y on Wednesday, you shifted to Z").
- **Two-Output Rule**: every answer also updates the relevant pages.
- **`raw/` is immutable** — original sources are never edited, only summarized/rewritten into `wiki/`.

### Step 3 — Run the matching command and propagate updates

For the high-leverage flows:

- **`/obsidian-save`** — pull every decision, person, task, and idea out of the conversation; distribute each to the right note.
- **`/obsidian-ingest <url|file|image|audio>`** — saves the original to `raw/` (immutable), then REWRITES 5–15 entity/concept pages, resolves contradictions, creates synthesis pages, updates `index.md` / `log.md` / daily note.
- **`/obsidian-reconcile`** — find contradictions across the vault and resolve them, documenting why.
- **`/obsidian-synthesize`** — find unnamed cross-source patterns and write synthesis pages.
- **`/obsidian-challenge`** — search the vault for past failures/reversed decisions on the topic and push back with the user's own words.
- **`/research-deep <topic>`** — scan the vault first, identify gaps, fill only the gaps via Perplexity (web) + Grok (X) or free key-less sources, then propagate updates across people/projects/ideas. Vault-first means it never re-researches what you already know.

### Step 4 — Install / build for the target CLI when asked

Install path differs per CLI; vault behavior is identical. Full matrix + research-toolkit key table in [references/install.md](references/install.md).

- **Plugin (recommended for this jeo-skill front door):** `npx skills add https://github.com/akillness/jeo-skills --skill obsidian-second-brain` (or `bash scripts/install.sh`).
- **Upstream Claude Code:** `curl -fsSL https://raw.githubusercontent.com/akillness/obsidian-second-brain/main/scripts/quick-install.sh | bash`, then `/obsidian-init`.
- **Upstream Codex / Gemini / OpenCode:** `git clone` then `bash scripts/build.sh --platform <codex-cli|gemini-cli|opencode>` and copy `dist/<platform>/` into the vault. Codex needs `bash scripts/install-codex-wrappers.sh` for named command shims.
- **Research toolkit (optional):** `cp .env.example ~/.config/obsidian-second-brain/.env`, add keys, `uv sync`. Or `bash scripts/install.sh` and answer "y" to the research prompt. `/research` + `/research-deep` work key-less.

### Step 5 — Set up automation when the user wants the vault to stay alive

- **Background agent** fires after every context compaction (PostCompact → headless `claude -p` → vault updated).
- **Scheduled agents**: `morning` (8 AM daily note + overdue), `nightly` (10 PM consolidation: close + reconcile + synthesize + heal orphans + rebuild index), `weekly` (Fri 6 PM review), `health` (Sun 9 PM audit).
- **Save reminders**: nudge `/obsidian-save` after 10+ exchanges or on "done"/"thanks".

Vault layout, presets (executive / builder / creator / researcher), and agent details live in [references/vault-architecture.md](references/vault-architecture.md).

## Integrity guardrails

- **Never fabricate** vault facts, citations, or research sources. Research notes record sources verbatim with recency markers `(as of YYYY-MM, source.com)`.
- **Rewrite over append**, but never silently destroy an opposing claim — reconcile it and keep the audit trail (bi-temporal facts).
- **Respect `raw/` immutability** — original sources are read-only.
- **Open models follow instructions less reliably** than Claude. Prefer Claude or `hermes-4-405b` for the synthesis-heavy commands (`/obsidian-architect`, `/obsidian-reconcile`, `/research-deep`); the AI-first vault rule still applies on every write.
- **API keys stay local** — `~/.config/obsidian-second-brain/.env`, `chmod 600`, never committed.

## Reference files

- [references/commands.md](references/commands.md) — all 45 commands grouped by layer, with triggers and what each does.
- [references/install.md](references/install.md) — 4-CLI install matrix, Hermes/open-model setup, research-toolkit key table.
- [references/vault-architecture.md](references/vault-architecture.md) — vault layout, presets, background + scheduled agents, the AI-first vault rule.

Upstream: [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain)
(origin: [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain), MIT).
