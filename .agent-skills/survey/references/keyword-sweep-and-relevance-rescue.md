# Keyword Sweep and Relevance Rescue (Hourly)

This reference hardens hourly survey runs for five mandatory lanes.

## Mandatory lanes
- agentic ai skill
- web frontend skill
- web backend skill
- cli open source skill
- game development skill

## Recovery policy
1. Stage-1 query expansion: add a traction constraint (e.g., `stars:>5000`).
2. Stage-2 recency rescue: add a pushed window (e.g., `pushed:>=2025-01-01`).
3. If still zero results, mark `lane_status: degraded` and include `degraded_causes: ["no-results"]`.

## Promotion gates
- Token-overlap intent match in name/description.
- Negation-aware exclusion (`no cli`, `without cli`, `non-cli`, `not a cli`).
- Signal floor (`stars >= 3` by default).
- Freshness by age (`pushedAt` within 24 months).
- License present after shape normalization + enrichment fallback.

## Provenance labels
Use validator-accepted labels directly in markdown and JSON:
- indexed snippet
- feed recovery
- direct page retrieval
- browser-rendered retrieval
- browser-rendered indexed snippet
- thin evidence
