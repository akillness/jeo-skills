---
name: graphify
description: >
  Route durable graph-building requests into one honest mode: assistant-native
  install, local Python build, incremental refresh, graph query follow-up, or a
  graphify-style structural fallback for markdown-heavy corpora. Use when the
  user wants `GRAPH_REPORT.md`, `graph.json`, `graph.html`, repo/corpus
  relationship tracing, mixed code+docs+asset graphing, or graph-backed
  architecture understanding that should persist across sessions. Route simple
  locate/reference work to `codebase-search`, narrative knowledge-base work to
  `llm-wiki`, and project-memory handoff to `opencontext`.
allowed-tools: Bash Read Write Grep Glob
compatibility: >
  Best when Python 3.10+ is available and Graphify can be installed via the
  official PyPI package `graphifyy`. Supports assistant-native install flows for
  Claude/Codex/Gemini/OpenCode plus truthful local fallbacks when the native
  `/graphify` UX is unavailable.
metadata:
  tags: knowledge-graph, codebase-analysis, graphrag, architecture, graphify, corpus-analysis, persistent-memory
  platforms: Claude, ChatGPT, Gemini, Codex, OpenCode
  version: "2.0.0"
  source: akillness/oh-my-skills
---

# Graphify

Use this skill when the main question is **"what graph mode should we trust, what artifact should we produce, and what should we read next?"**

The job is not to dump every Graphify feature or pretend all repo-understanding work needs a graph.
The job is to:
1. classify the request into one graph packet,
2. choose one honest execution mode,
3. scope the corpus before runtime or token pain explodes,
4. report artifacts and fallback truthfully,
5. route search-only, wiki-only, or project-memory work to the right neighboring skill.

Read [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md) before handling an unfamiliar request.
Read [references/build-and-fallback-recipes.md](references/build-and-fallback-recipes.md) when choosing between assistant-native install, local Python, incremental refresh, and structural fallback.

## When to use this skill
- The user explicitly wants `GRAPH_REPORT.md`, `graph.json`, `graph.html`, a codebase graph, or a persistent knowledge graph
- The request is about repo/corpus structure, graph-backed relationship tracing, path queries, or architecture discovery that should survive the current session
- The corpus mixes code, docs, PDFs, notes, screenshots, or other assets and the user wants one durable structure layer
- The user wants to refresh, query, or explain an existing Graphify output instead of re-reading raw files from scratch
- The user asks to install Graphify into Claude, Codex, Gemini, OpenCode, or another coding assistant for always-on graph access

## When not to use this skill
- **The user only needs to find a symbol, file owner, config location, or reference chain** → use `codebase-search`
- **The user wants a persistent markdown knowledge base or filed research notes** → use `llm-wiki`
- **The user wants project/repo memory, manifests, or cross-agent handoff packets** → use `opencontext`
- **The user needs dependency-only JS/TS analysis or a quick repo tree diagram, not a durable graph memory layer**
- **The request is generic GraphRAG / text-KG architecture without a concrete Graphify or durable structure ask**

## Instructions

### Step 1: Start from the graph packet already in hand
Use [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md).

Normalize the request into one of these packet shapes:
- `repo-structure-packet` — map a codebase or subsystem before editing
- `relationship-trace-packet` — answer a path/query/explain question from an existing or newly built graph
- `mixed-corpus-memory-packet` — build durable structure across code + docs + assets + sources
- `assistant-install-packet` — install Graphify into an assistant for always-on use
- `refresh-or-fallback-packet` — update an existing graph, recover from empty/weak output, or switch to structural fallback

Capture the smallest useful frame:

```markdown
Packet: repo-structure-packet
Scope: src/ + docs/architecture/
Need: GRAPH_REPORT.md + one path query
Graph state: no current outputs
Main risk: whole-repo graphing is too noisy
```

Rule: start from the packet the user already has. Do not force every request through a full feature tour.

### Step 2: Choose one primary mode
Pick exactly one primary mode:
- `assistant-native-install` — install Graphify into Claude/Codex/Gemini/OpenCode because always-on `/graphify` access is the real goal
- `local-python-build` — run the local Python/API workflow because the environment needs a truthful non-native path
- `incremental-refresh` — update an existing graph on changed scope instead of rebuilding everything blindly
- `graph-query-followup` — start from current artifacts and answer focused graph-backed questions
- `structural-fallback` — produce a graphify-style structural graph when native extraction is unavailable, empty, or misleading for a markdown-heavy corpus

Optional: mention one fallback mode, but do not hand the user five equal options.

### Step 3: Scope the corpus before doing anything expensive
Choose the smallest path that answers the question.

Good defaults:
- repo root only when the user truly needs repo-wide architecture
- `src/`, `app/`, `packages/foo/`, or one service directory for implementation work
- `raw/`, `docs/`, or a mixed research folder for corpus graphing
- existing `graphify-out/` when the job is query/refresh rather than rebuild

Rules:
- avoid blind whole-repo graphing on large repos
- prefer `.graphifyignore` or smaller scope over hoping runtime cost behaves
- if the graph request is really a locate/reference request, route to `codebase-search`

### Step 4: Tell the truth about install and runtime shape
Use [references/build-and-fallback-recipes.md](references/build-and-fallback-recipes.md).

Core facts to preserve:
- official PyPI package name: `graphifyy`
- CLI command: `graphify`
- Python 3.10+
- assistant-native installs exist for Claude / Codex / Gemini / OpenCode and related tools
- local automation may need a Python/API path or structural fallback rather than assuming assistant-native `/graphify` is available

Never blur these cases:
- **always-on assistant install**
- **local one-shot graph build / refresh**
- **querying an existing graph**
- **structural fallback because native extraction is not the honest answer**

### Step 5: Run the chosen mode with the narrowest recipe
Keep commands or steps minimal and mode-specific.

Typical recipes:
- `assistant-native-install` → install / verify the assistant-specific Graphify integration
- `local-python-build` → install `graphifyy`, verify runtime, run the Python pipeline or tested local workflow, and export `GRAPH_REPORT.md`, `graph.json`, and `graph.html`
- `incremental-refresh` → reuse existing artifacts and refresh only the changed scope when practical
- `graph-query-followup` → read `GRAPH_REPORT.md` first, then run `query`, `path`, or `explain`
- `structural-fallback` → build the smallest truthful graph from filesystem structure, frontmatter, support files, and explicit mentions instead of pretending native semantic extraction succeeded

If the corpus is markdown-heavy and native extraction returns a 0-node or misleading graph, switch modes instead of retrying the same failing path.

### Step 6: Read artifacts in the right order
Always prefer:
1. `graphify-out/GRAPH_REPORT.md`
2. `graphify-out/graph.html`
3. `graphify-out/graph.json`

Do **not** dump raw `graph.json` into a prompt if the report or a focused query is enough.

### Step 7: Route adjacent work outward
This skill owns durable graph mode choice and graph-backed follow-up, not every repo/corpus task.

Typical route-outs:
- `codebase-search` — exact text, symbol, config/content ownership, and impact mapping before graphing
- `llm-wiki` — narrative synthesis, wiki pages, source filing, long-lived markdown knowledge bases
- `opencontext` — searchable decisions, manifests, stable links, and project-memory handoff
- `survey` — broader landscape scans when the real question is tool/platform comparison before choosing Graphify

If the user asks “build or query the graph,” stay here.
If they ask “find the file/symbol fast,” “file this as a wiki note,” or “store this as project memory,” route out.

### Step 8: Return one concise graph brief
Always return a short operator-style brief with:
- packet
- primary mode
- scope
- output directory / artifacts
- whether the result was native Graphify or structural fallback
- 1–3 next steps or queries
- one route-out if neighboring work now owns the next step

## Output format
Always return a **graph build brief**, **graph refresh brief**, **graph query brief**, or **Graphify install brief**.

Required qualities:
- identify the packet already in hand
- choose one primary mode
- name the scope explicitly
- state which artifacts exist or were created
- label fallback mode honestly when native extraction was not used
- read from `GRAPH_REPORT.md` before over-focusing on raw graph JSON
- route search-only, wiki-only, or project-memory work outward

## Examples

### Example 1: understand a repo before editing
**Input**
> Map this repo with Graphify so I can understand the architecture before touching code.

**Good output direction**
- `repo-structure-packet`
- `local-python-build` or `assistant-native-install` depending on environment
- scopes the repo honestly
- reports `GRAPH_REPORT.md`, `graph.json`, `graph.html`

### Example 2: trace a relationship from an existing graph
**Input**
> We already have graphify-out. What connects the auth controller to billing?

**Good output direction**
- `relationship-trace-packet`
- `graph-query-followup`
- reads `GRAPH_REPORT.md` first, then uses `query` / `path`
- avoids unnecessary rebuilds

### Example 3: mixed corpus with markdown-heavy sources
**Input**
> Turn this docs + screenshots + notes folder into a persistent graph we can reuse next week.

**Good output direction**
- `mixed-corpus-memory-packet`
- chooses `local-python-build` or `structural-fallback`
- explains whether the result is native Graphify or graphify-style structural fallback

### Example 4: request is really search, not graphing
**Input**
> I just need to find where this config is defined and who references it.

**Good output direction**
- routes to `codebase-search`
- does not force Graphify where search is the bottleneck

## Best practices
1. Use the smallest scope that answers the question.
2. Keep assistant-native install, local build, refresh, query, and fallback as distinct modes.
3. Prefer `GRAPH_REPORT.md` before raw graph JSON.
4. Treat structural fallback as a first-class honest mode, not a hidden failure.
5. Route search-first work to `codebase-search` instead of overselling graphing.
6. Route narrative memory to `llm-wiki` and project memory to `opencontext`.
7. Refresh compact and discovery surfaces whenever the front-door wording changes materially.
8. If a graph build is machine-specific or path-leaky, say so instead of presenting it as portable truth.

## References
- [Mode packets and route-outs](references/mode-packets-and-route-outs.md)
- [Build and fallback recipes](references/build-and-fallback-recipes.md)
- `../codebase-search/SKILL.md`
- `../llm-wiki/SKILL.md`
- `../opencontext/SKILL.md`
- Graphify upstream: https://github.com/safishamsi/graphify
- Graphify PyPI: https://pypi.org/project/graphifyy/
