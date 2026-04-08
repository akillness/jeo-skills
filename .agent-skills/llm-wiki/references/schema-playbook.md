# Schema Playbook

Use this reference when writing or refining `AGENTS.md` or `CLAUDE.md` for the vault.

## What the schema must do

The schema is not prose about the idea. It is the rulebook the agent should follow every session.

Good schema files answer:

1. Which directories are immutable
2. Which files must be updated on every ingest
3. What page types exist and what they are for
4. How answers must cite pages or raw sources
5. What a lint pass should inspect

## Minimum contract

At minimum, encode these rules:

```md
1. Never rewrite files under raw/.
2. On ingest update raw capture, one source page, relevant concept/entity pages, index.md, and log.md.
3. Read index.md first for queries.
4. File durable answers back into wiki/queries/ or wiki/reports/.
5. Use wiki links for internal references.
6. During lint passes check broken links, orphan pages, stale claims, contradictions, and missing page candidates.
```

## Good additions

Add only rules that will actually change behavior:

- page frontmatter conventions
- page templates per directory
- how to mark uncertainty or contradiction
- how to label stale claims
- when to open raw sources instead of trusting the wiki
- when to create a new concept page instead of bloating an existing one

## Bad additions

Avoid schema bloat:

- generic writing advice the agent already knows
- giant lists of optional tools
- vague style rules with no enforcement
- aspirational workflows you will not follow

## Suggested schema sections

```md
# Wiki Schema
## Invariants
## Page Types
## Ingest Workflow
## Query Workflow
## Lint Workflow
## Citation Rules
## Naming Rules
```

## Example page-type guidance

- `wiki/sources/`: grounded summary tied to one raw source
- `wiki/entities/`: stable page for a recurring named thing
- `wiki/concepts/`: synthesis across many sources
- `wiki/queries/`: filed answer to a reusable question
- `wiki/reports/`: durable memo, comparison, or presentation backbone

## Revision strategy

Refine the schema only when you observe repeated drift:

- the agent forgets to update `index.md`
- query answers stay in chat instead of being filed
- source pages lack enough grounding
- the same ambiguity shows up across multiple sessions

When that happens, add or sharpen one rule at a time.
