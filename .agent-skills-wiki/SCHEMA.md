# Wiki Schema

## Domain
This wiki covers continuous maintenance of `oh-my-skills/.agent-skills`: surveys, consolidation decisions, support-file coverage, canonical-vs-alias policy, and durable notes about which skills should be upgraded, merged, or left alone.

## Conventions
- File names: lowercase, hyphens, no spaces.
- Every wiki page starts with YAML frontmatter.
- Use `[[wikilinks]]` between related concept and query pages.
- When updating a page, bump the `updated` date.
- Every new page must be added to `index.md`.
- Every meaningful run must append an entry to `log.md`.

## Frontmatter
```yaml
---
title: Page Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: concept | query | comparison | summary
tags: [from taxonomy below]
sources: [repo paths or survey files]
---
```

## Tag Taxonomy
- `skills` — skill-catalog structure and decisions
- `consolidation` — duplicate/merge/alias findings
- `trigger-design` — activation wording and boundary design
- `skill-quality` — references/evals/support-file coverage
- `graphify` — structural graph findings
- `survey` — survey-driven research artifacts
- `frontend` — frontend/web skill clusters
- `game-dev` — game-related skill clusters
- `project-management` — PM/process skill clusters
- `docs` — README/setup/index surface notes

Rule: add new tags here before using them.

## Page Thresholds
- Create a concept page when a durable repo pattern or cluster matters across runs.
- Create a query page when a specific run produced a decision worth reusing later.
- Add to existing pages when the new run extends an existing cluster rather than creating a new one.
- Avoid pages for one-off syntax fixes or trivial housekeeping.

## Update Policy
When new evidence changes a prior recommendation:
1. Prefer the newer repo state and note the old recommendation if it mattered.
2. If the evidence is mixed, preserve both positions with dates and sources.
3. Update linked concept/query pages rather than creating duplicates.
