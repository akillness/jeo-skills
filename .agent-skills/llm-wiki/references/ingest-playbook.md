# Ingest Playbook

Use this reference when turning raw material into wiki updates.

## Default ingest flow

1. Save the raw source under `raw/sources/`
2. Create or refresh a page in `wiki/sources/`
3. Update relevant `wiki/entities/` and `wiki/concepts/` pages
4. Update `index.md`
5. Append an entry to `log.md`

## Source-summary checklist

Each page in `wiki/sources/` should usually capture:

- what the source is
- the strongest grounded claims
- why it matters to the broader wiki
- what it conflicts with or leaves uncertain
- which concept or entity pages should absorb the information

## URL ingest with Scrapling

Use the helper when the source is on the web:

```bash
bash scripts/ingest-url.sh /path/to/vault "https://example.com/article"
```

Escalation:

- `--mode get` for normal static pages
- `--mode fetch` for JS-rendered pages
- `--mode stealth` only when protection blocks ordinary fetching

Pass extra Scrapling flags after `--` or directly as trailing arguments:

```bash
bash scripts/ingest-url.sh /path/to/vault "https://app.example.com/post" --mode fetch --wait-selector article
```

## Local-file ingest

If the source already exists locally:

1. Put it in `raw/sources/`
2. Create a `wiki/sources/` page manually or with your own helper
3. Ask the agent to update affected synthesis pages

This is often better for PDFs, exported chat logs, or meeting transcripts.

## One-at-a-time versus batch ingest

### Prefer one-at-a-time when:

- the schema is still changing
- the topic is nuanced
- you want to guide emphasis or catch misunderstanding early

### Batch ingest is reasonable when:

- page types are stable
- the source set is homogenous
- you mostly want broad coverage first, then cleanup later

## Contradictions

Do not silently overwrite disagreement.

When new evidence challenges an older claim:

- update the relevant concept page
- cite both sources
- note which claim is newer, weaker, disputed, or unresolved
- optionally create a dedicated comparison or contradiction note if it matters often
