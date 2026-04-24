# Keyword Sweep and Relevance Rescue (Hourly Repo-Maintenance)

Use this guide when a `survey` run is part of recurring skill maintenance (for example, hourly cron loops).

## Required keyword families (hourly maintenance loop)

Run all five keyword families before final recommendations:

1. `agentic ai skill`
2. `web frontend skill`
3. `web backend skill`
4. `cli open source skill`
5. `game development skill`

Keep the raw sweep output as discovery evidence.

## Why this exists

Broad keyword sweeps improve recall but can produce noisy or sparse results.
Without a relevance gate, low-fit repositories pollute recommendations.
Without a rescue path, empty lanes can be misread as ecosystem absence.

## Compact relevance gate

For each candidate you keep, capture at minimum:

- `license`
- `pushed_at` or `updated_at`
- `archived`
- one-line fit rationale

Positive keep signals:

- Clearly related to the target capability
- Recently maintained
- Explicit license
- Concrete docs/examples

Drop or risk-mark signals:

- Keyword-only match but wrong domain
- Archived/stale without strong reason
- Missing basic metadata
- Spam-like or boilerplate descriptions

## Rescue path for sparse/noisy lanes

If direct web search/extract is degraded or returns mostly noise:

1. Switch to GitHub-native retrieval (`gh search repos`, `gh api`, `gh repo view`).
   - Preferred command shape:
     - `gh search repos "<query>" --json fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount`
   - Use `fullName` + `license` (not GraphQL-style `nameWithOwner` / `licenseInfo`).
2. Add curated seed repositories relevant to the target capability.
3. Apply the same relevance gate to seed candidates.
4. Label provenance explicitly (`direct page retrieval`, `browser-rendered retrieval`, etc.).

## Reporting checklist

Before final recommendations:

- [ ] All five keyword families executed
- [ ] Raw discovery evidence saved
- [ ] Relevance gate applied to kept candidates
- [ ] Metadata minimum recorded for each kept candidate
- [ ] Provenance labels present
- [ ] Risks for noisy or sparse lanes stated explicitly
