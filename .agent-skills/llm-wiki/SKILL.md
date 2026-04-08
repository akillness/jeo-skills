---
name: llm-wiki
description: >
  Build and maintain a persistent markdown wiki that an LLM updates on the user's behalf,
  usually inside an Obsidian vault or git-tracked notes repo. Use when raw sources such as web
  articles, papers, meeting notes, transcripts, screenshots, or past analyses need to be turned
  into an interlinked knowledge base with immutable source files, LLM-written wiki pages,
  `index.md`, `log.md`, schema rules in `AGENTS.md` or `CLAUDE.md`, source summaries, query
  notes, and recurring lint passes. Triggers on: llm-wiki, personal wiki, obsidian wiki,
  research vault, knowledge base, source ingest, persistent notes, wiki maintenance, source
  summaries, query filing.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: Idea adapted into repository skill implementation
metadata:
  tags: llm-wiki, obsidian, knowledge-base, markdown, research, synthesis, scrapling, qmd, notes, wiki
  version: "1.0"
  source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
---

# llm-wiki - Persistent LLM-Maintained Markdown Wiki

> **Keyword**: `llm-wiki` · `obsidian wiki` · `research vault` · `knowledge base`
>
> Use this skill when the user wants knowledge to accumulate as a maintained markdown artifact, not be rediscovered from raw files on every query.

`llm-wiki` turns Andrej Karpathy's gist into an operational workflow. The core pattern is simple: keep raw sources immutable, let the LLM own the wiki layer, and encode the maintenance contract in `AGENTS.md` or `CLAUDE.md`.

## When to use this skill

- Bootstrap a new Obsidian or markdown vault for long-lived knowledge work
- Convert raw articles, papers, transcripts, or notes into source summaries plus cross-linked wiki pages
- Maintain `index.md` and `log.md` as navigational primitives before adding heavier search infrastructure
- File good answers back into the wiki instead of losing them in chat history
- Run periodic lint passes for broken links, orphan pages, stale claims, and missing synthesis pages
- Add optional helpers such as Scrapling for URL ingestion, qmd for search, or Obsidian CLI for vault automation

## Instructions

### Step 1: Bootstrap the vault

Create the wiki skeleton first:

```bash
bash scripts/bootstrap-vault.sh /path/to/vault
```

The bootstrap creates:

- `raw/sources/` for immutable source markdown or copied files
- `raw/assets/` for downloaded images and attachments
- `wiki/sources/` for per-source summaries
- `wiki/entities/` and `wiki/concepts/` for durable synthesis pages
- `wiki/queries/` and `wiki/reports/` for filed answers and higher-value outputs
- `index.md`, `log.md`, and `AGENTS.md`

Do not skip the schema file. The schema is what makes the agent act like a disciplined maintainer instead of a generic assistant. See [references/architecture.md](references/architecture.md) and [references/schema-playbook.md](references/schema-playbook.md).

### Step 2: Treat `AGENTS.md` or `CLAUDE.md` as the operating contract

The schema should encode the rules that stay true across sessions:

- `raw/` is source of truth and must stay immutable
- `wiki/` plus `index.md` and `log.md` are LLM-owned working artifacts
- Every ingest updates the source summary, relevant synthesis pages, `index.md`, and `log.md`
- Every durable query answer gets filed back into `wiki/queries/` or `wiki/reports/`
- Lint passes must look for broken links, orphan pages, stale claims, contradictions, and missing page candidates

Keep the schema short and enforceable. A small contract that the agent actually follows is better than a giant policy file nobody will reread. The starter schema from `bootstrap-vault.sh` is intentionally minimal; refine it with [references/schema-playbook.md](references/schema-playbook.md).

### Step 3: Ingest one source at a time until the workflow is stable

If the source is already local, place it in `raw/sources/` and ask the agent to process it. If the source is a URL, use the Scrapling-powered helper:

```bash
bash scripts/ingest-url.sh /path/to/vault "https://example.com/article"
bash scripts/ingest-url.sh /path/to/vault "https://app.example.com/post" --mode fetch --wait-selector article
bash scripts/ingest-url.sh /path/to/vault "https://protected.example.com/post" --mode stealth --solve-cloudflare
```

Expected ingest touch points:

1. Save the immutable raw capture under `raw/sources/`
2. Create or refresh a source page under `wiki/sources/`
3. Update relevant entity or concept pages
4. Update `index.md`
5. Append a chronological entry to `log.md`

Prefer one-source-at-a-time ingest when starting. It forces the human to inspect what the wiki changed, surface missing conventions, and refine the schema. Once the workflow is reliable, batching is fine. Use [references/ingest-playbook.md](references/ingest-playbook.md) for the operating checklist.

### Step 4: Query against the wiki, not the raw pile

When answering questions:

1. Read `index.md` first
2. Open the most relevant wiki pages
3. Drill into raw sources only when the wiki needs grounding or conflict resolution
4. Cite page paths and raw source paths explicitly
5. File durable outputs back into the vault

Create a reusable note stub for high-value answers:

```bash
bash scripts/new-query-note.sh /path/to/vault "How does Company A differ from Company B?" --question "How does Company A differ from Company B?"
bash scripts/new-query-note.sh /path/to/vault "Q2 product thesis" --section reports --citation "[[wiki/concepts/product-thesis]]"
```

Use `wiki/queries/` for question-shaped outputs and `wiki/reports/` for more durable synthesized artifacts such as memos, comparisons, or presentation backbones. More detail lives in [references/query-and-filing.md](references/query-and-filing.md).

### Step 5: Lint and repair the wiki periodically

Run the local health check:

```bash
python3 scripts/lint-wiki.py /path/to/vault
python3 scripts/lint-wiki.py /path/to/vault --format json
```

This script focuses on structure, not truth. It checks required files and directories, broken wiki links, and orphan pages. Use the lint output as the starting point for a human-guided cleanup pass:

- merge duplicate concepts
- promote heavily referenced ideas into their own page
- retire stale claims superseded by newer sources
- add backlinks or summary pages where the graph is too sparse

See [references/maintenance-and-scaling.md](references/maintenance-and-scaling.md) for the higher-level lint checklist.

### Step 6: Add search and automation only when scale justifies it

`index.md` plus `log.md` is enough for small-to-medium vaults. Add heavier tools later:

- **Scrapling** when URL ingestion becomes common
- **qmd** when the index is no longer sufficient for wiki search
- **Obsidian CLI** when you want shell-driven vault automation against a running desktop app
- **Dataview** when you start relying on frontmatter-driven tables and lists
- **Git** from day one for version history, branching, and reviewable diffs

Do not force embeddings, MCP, or browser automation on day one. The point of this workflow is that a simple markdown repo already compounds knowledge surprisingly well.

## Examples

### Example 1: Bootstrap a fresh vault

```bash
bash scripts/bootstrap-vault.sh ~/vaults/company-research
```

### Example 2: Capture a static article into raw sources and create a source stub

```bash
bash scripts/ingest-url.sh ~/vaults/company-research "https://example.com/article"
```

### Example 3: Capture a JavaScript-rendered page

```bash
bash scripts/ingest-url.sh ~/vaults/company-research "https://app.example.com/dashboard" --mode fetch --network-idle
```

### Example 4: Create a durable query note

```bash
bash scripts/new-query-note.sh ~/vaults/company-research "Why this market is consolidating" \
  --question "Why is this market consolidating?" \
  --citation "[[wiki/concepts/market-structure]]"
```

### Example 5: Create a report stub instead of a query note

```bash
bash scripts/new-query-note.sh ~/vaults/company-research "Q3 diligence memo" --section reports
```

### Example 6: Run the structure lint

```bash
python3 scripts/lint-wiki.py ~/vaults/company-research
```

## Best practices

1. Keep `raw/` immutable. Corrections belong in wiki pages or follow-up source notes, not in rewritten raw captures.
2. Update `index.md` and `log.md` on every ingest, query filing, and lint pass. If these drift, the whole workflow gets harder to navigate.
3. Prefer a few strong entity and concept pages over hundreds of weak fragments. Compounding happens through synthesis, not page count.
4. Read `index.md` before doing expensive retrieval work. It is the simplest useful search system for moderate vault sizes.
5. Distinguish facts from synthesis. Source pages should be grounded; concept pages can be more interpretive.
6. File good answers back into the vault. If the answer mattered once, it will probably matter again.
7. Use git commits to separate ingest, query, and lint operations so the wiki stays auditable.
8. Keep the schema alive. Update `AGENTS.md` when you notice repeated drift or ambiguity.

## References

- [references/architecture.md](references/architecture.md)
- [references/schema-playbook.md](references/schema-playbook.md)
- [references/ingest-playbook.md](references/ingest-playbook.md)
- [references/query-and-filing.md](references/query-and-filing.md)
- [references/maintenance-and-scaling.md](references/maintenance-and-scaling.md)
- [scripts/bootstrap-vault.sh](scripts/bootstrap-vault.sh)
- [scripts/ingest-url.sh](scripts/ingest-url.sh)
- [scripts/new-query-note.sh](scripts/new-query-note.sh)
- [scripts/lint-wiki.py](scripts/lint-wiki.py)
- [Karpathy gist: llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
