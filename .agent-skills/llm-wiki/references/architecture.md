# Architecture

Use this reference when designing the initial vault layout or explaining why the workflow is different from plain RAG.

## Three layers

### 1. Raw sources

Store original source material under `raw/`.

- `raw/sources/` for markdown captures, transcripts, pasted notes, or copied text files
- `raw/assets/` for downloaded images and attachments

Rules:

- Treat this layer as immutable
- Correct mistakes with follow-up notes, not silent rewrites
- Keep a stable path so wiki pages can cite the exact raw file they relied on

### 2. The wiki

Store LLM-maintained pages under `wiki/`.

- `wiki/sources/` for per-source summaries
- `wiki/entities/` for people, companies, products, places, or recurring named things
- `wiki/concepts/` for themes, mechanisms, models, or theses
- `wiki/queries/` for filed answers to specific questions
- `wiki/reports/` for higher-value durable syntheses

The wiki is the compiled knowledge layer. It can change often.

### 3. The schema

Store the operating contract in `AGENTS.md`, `CLAUDE.md`, or the platform-specific equivalent.

The schema should answer:

- What the directories mean
- What gets updated on ingest
- How answers should be cited and filed
- What lint passes should check
- Which files are human-owned versus LLM-owned

## Recommended tree

```text
vault/
├── AGENTS.md
├── index.md
├── log.md
├── raw/
│   ├── sources/
│   └── assets/
└── wiki/
    ├── sources/
    ├── entities/
    ├── concepts/
    ├── queries/
    └── reports/
```

## Navigation primitives

### `index.md`

`index.md` is the content-oriented map.

Keep one bullet per durable page with:

- wiki link
- one-line summary
- optional counts or dates when those help

Read it before broad search.

### `log.md`

`log.md` is chronological.

Use it for:

- ingest entries
- query filings
- lint passes

Stable heading patterns make it grep-friendly:

```md
## [2026-04-08] ingest | Example title
## [2026-04-08] query  | Example question
## [2026-04-08] lint   | Weekly cleanup
```

## Page naming

- Use kebab-case file names
- Keep a single H1 at the top of each page
- Prefer stable paths over human-perfect names
- Use dates for source captures and query notes when chronology matters

Examples:

- `wiki/sources/2026-04-08-example-article.md`
- `wiki/entities/openai.md`
- `wiki/concepts/long-context-training.md`
- `wiki/queries/2026-04-08-why-market-share-changed.md`
