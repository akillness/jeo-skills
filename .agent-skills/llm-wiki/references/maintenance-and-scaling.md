# Maintenance and Scaling

Use this reference when the wiki grows beyond a handful of pages and needs regular cleanup.

## Structural lint

Start with the local script:

```bash
python3 scripts/lint-wiki.py /path/to/vault
```

This catches:

- missing required files or directories
- broken wiki links
- orphan pages with no inbound links

## Higher-level lint questions

After the structural check, ask the agent:

- Which pages make claims that newer sources might have invalidated?
- Which concepts are mentioned repeatedly but lack their own page?
- Which pages are too broad and should be split?
- Which pages are thin and should probably merge into a larger synthesis page?
- Which questions keep reappearing and should become query or report pages?

## Suggested maintenance cadence

- after each ingest: quick index/log update
- weekly: structural lint and orphan cleanup
- monthly: contradiction and stale-claim review
- quarterly: schema review and folder convention cleanup

## Git hygiene

Git makes the workflow auditable.

Prefer commits that separate:

- ingest work
- query filing
- lint and cleanup

This makes it easier to review or revert low-quality changes.

## When to add search tooling

Stay with `index.md` first. Add search when:

- the index becomes too long to scan quickly
- concept pages reference too many sources to navigate manually
- you have enough pages that grep alone is noisy

Karpathy's gist mentions `qmd` as a strong local option for markdown search. It is optional, not foundational.

## Useful optional tools

- **qmd** for local markdown search or MCP access
- **Obsidian CLI** for terminal-driven vault automation
- **Dataview** for frontmatter-based lists and tables
- **Marp** for presentation generation from markdown
- **Obsidian graph view** for spotting hubs and orphans visually

## Scaling principle

Do not optimize early for the hundredth source. Make the first twenty ingests high quality. A small but well-maintained wiki compounds better than a huge pile of weak pages.
