---
name: obsidian-second-brain
description: >-
  Route obsidian-second-brain installation and self-rewriting wiki operations.
  Use when creating a consented new Obsidian vault, capturing sources, reconciling
  claims, synthesizing knowledge or reviewing its scheduled maintenance. Includes
  pinned operating documents and a shared tool-free proposal runtime; native
  PostCompact wiring is scoped to the new Claude vault, not every host.
allowed-tools: Read Write Edit Bash Grep Glob WebFetch
aliases: /create-command /idea-discovery /notebooklm /obsidian-adr /obsidian-agenda /obsidian-architect /obsidian-board /obsidian-calendar /obsidian-capture /obsidian-catchup /obsidian-challenge /obsidian-connect /obsidian-daily /obsidian-decide /obsidian-emerge /obsidian-export /obsidian-find /obsidian-graduate /obsidian-health /obsidian-init /obsidian-ingest /obsidian-learn /obsidian-log /obsidian-meeting /obsidian-panel /obsidian-person /obsidian-project /obsidian-projects /obsidian-recap /obsidian-reconcile /obsidian-recurring /obsidian-review /obsidian-save /obsidian-schedule /obsidian-synthesize /obsidian-task /obsidian-visualize /obsidian-world /podcast /research /research-deep /vault-deep-synthesis /x-pulse /x-read /youtube
compatibility: >
  Python 3.10+ and POSIX for consented new-vault setup/runtime. Copied operating
  documents can be used by Claude Code, Codex, Gemini, OpenCode and jeo; automated
  model events use Claude CLI. Native PostCompact is installed only in the new
  Claude vault. Other hosts have no equivalent native callback installed here.
  Obsidian and its CLI remain separate prerequisites. Routing-skill installation
  alone does not initialize a vault, indexes, provider access or automation.
metadata:
  tags: obsidian-second-brain, obsidian, second-brain, llm-wiki, knowledge-vault, note-taking, self-rewriting, contradiction-reconciliation, synthesis, research-toolkit, cross-cli, claude-code, codex, gemini, opencode
  platforms: Claude, Codex, Gemini, OpenCode, All
  keyword: obsidian-second-brain
  version: "1.1.0"
  upstream: https://github.com/akillness/obsidian-second-brain
  origin: https://github.com/eugeniughelbur/obsidian-second-brain
  source: akillness/jeo-skills
  license: MIT
---

# obsidian-second-brain

A routing-first front door for [obsidian-second-brain](https://github.com/akillness/obsidian-second-brain):
rewrite relevant knowledge pages with provenance, reconcile opposing claims, and
synthesize grounded connections while preserving original sources. The consented
adapter installs actual operating assets pinned to
`c8b1d8c1c5b41d4f1845f7188200d354837be96f` into a **new** general-purpose vault.
It does not migrate or change an existing vault/installation.

> **Keyword**: `obsidian second brain` · `self-rewriting vault` · `obsidian-save` · `obsidian-ingest`
>
> Shared operating documents and runtime do not imply identical native host hooks.

## When to use this skill

- The user wants an Obsidian vault that **maintains itself** instead of a static filing cabinet.
- The user wants to **capture work into the vault**: save a conversation, ingest supported text, or use reviewed command guidance for richer sources. Automatic binary extraction is not implemented.
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


## Invoking in jeo — the `$` entrypoint

In `jeo-code` (jeo) a skill loads **only** through the `$` entrypoint, never through
`/slash` typing. The `aliases:` frontmatter still publishes all 45 names into
`jeo skills`, the skill picker, and shell autocomplete for discovery, but the live
trigger is:

```
$obsidian-second-brain <command-or-intent> [args]
```

`$obsidian-s` (or any unambiguous prefix) resolves too; bare `$obsidian` does **not** —
that exact-matches the separate `obsidian` skill. Everything after the skill token is
handed to this file as the **intent**. Dispatch the intent deterministically:

1. **Explicit command** — if the first intent word matches one of the 45 command names
   (with or without a leading `/` and with or without the `obsidian-` prefix), run that
   exact command and treat the rest of the line as its arguments. All of these route to
   `/obsidian-ingest`:

   ```
   $obsidian-second-brain /obsidian-ingest https://example.com/post
   $obsidian-second-brain obsidian-ingest https://example.com/post
   $obsidian-second-brain ingest https://example.com/post
   ```

   More examples:

   ```
   $obsidian-second-brain save                    → /obsidian-save
   $obsidian-second-brain reconcile               → /obsidian-reconcile
   $obsidian-second-brain challenge "migrate to X" → /obsidian-challenge
   $obsidian-second-brain research-deep "rag eval" → /research-deep
   $obsidian-second-brain world                   → /obsidian-world
   $obsidian-second-brain x-read <url>            → /x-read
   ```

   The non-prefixed names that stay literal (no `obsidian-`): `create-command`,
   `idea-discovery`, `notebooklm`, `podcast`, `research`, `research-deep`,
   `vault-deep-synthesis`, `x-pulse`, `x-read`, `youtube`.

2. **Natural-language intent** — if the first word is not a command name, classify the
   request through Step 1 below (layer → command) and state the route before acting,
   e.g. `$obsidian-second-brain save everything from this chat` → *"Operations →
   `/obsidian-save`"*.

The chosen command is operating guidance, not approval for external tools or spend.
Native hooks differ by host; use the shared runtime only within reviewed consent.
Full command table in [references/commands.md](references/commands.md).

## Instructions

### Step 1 — Classify the request into one of the 4 layers

Pick the layer first, then the command. Automation requires explicit setup consent rather than being always on. Full command table in [references/commands.md](references/commands.md).

| Layer | Purpose | Pick when the user wants to… |
|-------|---------|------------------------------|
| **1 · Operations** (28 cmds) | Claude remembers | save, ingest, reconcile, export, daily notes, tasks, people, decisions, calendar, project/vault maintenance, architecture notes |
| **2 · Thinking Tools** (7 cmds) | Claude thinks with you | challenge an idea, convene a panel, surface patterns, bridge domains, deep-synthesize a topic, rank next directions, graduate an idea into a project |
| **3 · Context Engine** (1 cmd) | Claude knows who you are | load identity + state with progressive token budgets (`/obsidian-world`) |
| **4 · Research Toolkit** (7 cmds) | Claude pulls knowledge in | X read/pulse, web research, vault-first deep research, NotebookLM, YouTube, podcast |
| **Consented automation** | Shared runtime | inbox scans + morning/nightly/weekly/health events; native PostCompact only in the new Claude vault |

State the route explicitly before acting, e.g. *"Operations → `/obsidian-ingest`"* or *"Research → `/research-deep` (vault-first)"*.

### Step 2 — Honor the AI-first vault rule on every write

Apply this operating policy to knowledge-note writes; host proposal validation enforces paths/hashes, not factual or synthesis quality:

- Each note opens with a **`## For future Claude`** preamble (what this note is, why it matters, how to use it).
- Frontmatter is for **LLM retrieval**, not human review (type, tags, recency markers, sources verbatim).
- **Rewrite, don't append**: when a source adds depth or contradicts a page, rewrite that page and record why.
- **Bi-temporal facts**: track when a fact was true AND when the vault learned it ("You believed X on Tuesday; after ingesting Y on Wednesday, you shifted to Z").
- **Two-Output Rule** is interactive guidance: file relevant knowledge alongside the answer when authorized; it is not automatic capture of every host response.
- **All `raw/` trees are immutable**, including videos and archived-root sources; preserve originals and rewrite only derived knowledge. The portable lifecycle has no legacy GC or unapproved deletion.

### Step 3 — Run the matching command and propagate updates

For the high-leverage flows:

- **`/obsidian-save`** — pull every decision, person, task, and idea out of the conversation; distribute each to the right note.
- **`/obsidian-ingest`** — follow the installed capture playbook with separately authorized tools. The automatic inbox runtime accepts UTF-8 text only; unsupported binaries remain retained with explicit errors while supported entries progress independently.
- **`/obsidian-reconcile`** — find contradictions across the vault and resolve them, documenting why.
- **`/obsidian-synthesize`** — find unnamed cross-source patterns and write synthesis pages.
- **`/obsidian-challenge`** — search the vault for past failures/reversed decisions on the topic and push back with the user's own words.
- **`/research-deep <topic>`** — scan the vault first, identify gaps, fill only the gaps via Perplexity (web) + Grok (X) or free key-less sources, then propagate updates across people/projects/ideas. Vault-first means it never re-researches what you already know.

### Step 4 — Install only after reviewing new-vault consent

Read [references/install.md](references/install.md) for the exact configuration,
preview and apply contract. From this skill directory, the preferred command is:

```bash
JEO_SECOND_BRAIN_CONFIG=/absolute/reviewed.json bash scripts/install.sh
# Optional exact pinned local source:
JEO_SECOND_BRAIN_CONFIG=/absolute/reviewed.json JEO_SECOND_BRAIN_SOURCE=/absolute/pinned-checkout bash scripts/install.sh
```

Preview first with `python3 scripts/setup.py --config /absolute/reviewed.json --dry-run`;
omit `--dry-run` to apply directly. A local checkout uses `--source`. Installation
makes no model calls and never executes upstream `setup.sh` or global quick-install.
`WITH_UPSTREAM=1` selects this same path and **requires** the reviewed configuration.
Success reports `installed`/`unchanged`, not provider or initialized-index readiness.

Data, model, run/daily allowances, schedule, hooks and PostCompact need explicit
approval. Routing-only plugin install is separate; `JEO=1 VAULT=...` remains a
legacy advisory validator, not permission for model calls or background processing.
In jeo use `$obsidian-second-brain` or `$obsidian-s`; `$obsidian` is the separate
exact-match `obsidian` skill. No SessionStart/PostCompact event is invented for jeo.

### Step 5 — Use the consented runtime and retain tool roles

`setup.py` copies actual command/reference/template assets and standalone
`runtime.py`/`ctx_guard.py` modules. The model returns tool-free JSON proposals;
host code validates allowed wiki destinations and prior hashes before committing.
Scheduled scans and maintenance use this shared runtime. Native PostCompact is
registered only in the new Claude vault; other hosts use copied operating docs
and the shared runner, not fake native hooks.

The portable lifecycle retains Graphify/mex/zvec/ctx roles without a private HOME
`ctx` source. Index creation is separately approved and reported pending until
initialized. Graphify rebuilding is checkpoint-only and requires separate provider
and unbounded-cost authority; Claude allowance estimates do not cap Graphify spend
or guarantee hard billing limits. Real provider model-quality and live host
integration remain unverified by installed smoke/fixture tests.

See [references/vault-architecture.md](references/vault-architecture.md) for exact
events, storage, source-format errors, immutable raw retention and lifecycle roles.

## Integrity guardrails

- **Never fabricate** vault facts, citations, or research sources. Research notes record sources verbatim with recency markers `(as of YYYY-MM, source.com)`.
- **Rewrite over append**, but never silently destroy an opposing claim — reconcile it and keep the audit trail (bi-temporal facts).
- **Respect `raw/` immutability** — original sources are read-only.
- **Model quality is unverified** — JSON/path/hash checks do not prove a model's factual accuracy, reconciliation or synthesis quality; review those outputs against sources.
- **API keys stay in the selected CLI/provider's local credential mechanism**, not the reviewed configuration, committed notes or source examples.

## Reference files

- [references/commands.md](references/commands.md) — all 45 commands grouped by layer, with triggers and what each does.
- [references/install.md](references/install.md) — reviewed new-vault configuration, pinned assets, preview/apply, host scope and separate provider authority.
- [references/vault-architecture.md](references/vault-architecture.md) — transaction flow, scheduled events, source formats, portable lifecycle and raw-retention boundary.

Upstream: [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain)
(origin: [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain), MIT).

For a new installation, start with the read-only configuration preview in
[references/install.md](references/install.md).
