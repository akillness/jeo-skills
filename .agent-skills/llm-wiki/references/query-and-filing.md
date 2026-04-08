# Query and Filing

Use this reference when answering questions against the wiki and deciding what should become a durable page.

## Query workflow

1. Read `index.md`
2. Open the most relevant wiki pages
3. Use raw sources only when needed for grounding or conflict resolution
4. Synthesize the answer
5. Decide whether the answer deserves filing

## Read order

Prefer this order:

```text
index.md -> wiki/concepts or wiki/entities -> wiki/sources -> raw/sources
```

This keeps the workflow fast and preserves the value of the compiled wiki layer.

## What deserves filing

File the answer when it has any of these properties:

- it took real synthesis across multiple pages
- it exposed a new comparison or thesis
- it is likely to be asked again
- it changes how the rest of the wiki should be organized

## Queries versus reports

Use `wiki/queries/` for:

- one concrete question
- a concise answer with evidence
- reusable follow-up questions

Use `wiki/reports/` for:

- a memo
- a diligence note
- a thesis summary
- a deck backbone or presentation outline

## Helper script

Create a stub quickly:

```bash
bash scripts/new-query-note.sh /path/to/vault "How does X differ from Y?" --question "How does X differ from Y?"
```

For a report-shaped output:

```bash
bash scripts/new-query-note.sh /path/to/vault "Q2 strategy memo" --section reports
```

## Citation discipline

Good citations reference:

- wiki pages such as `[[wiki/concepts/example-thesis]]`
- raw captures such as `[[raw/sources/2026-04-08-example-article]]`
- source URLs when the raw file is not enough

Do not leave claims floating without a traceable page path or source.

## Follow-up loop

After filing a query or report:

- update any affected concept pages
- add missing cross-links
- update `index.md`
- append to `log.md`

The answer should improve the wiki, not just live beside it.
