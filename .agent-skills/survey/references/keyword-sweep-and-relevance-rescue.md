# Hourly Keyword Sweep and Relevance Rescue

This reference defines deterministic survey-first discovery behavior for hourly maintenance.

## Mandatory keyword lanes
- agentic ai skill
- web frontend skill
- web backend skill
- cli open source skill
- game development skill

## Recovery sequence
1. primary query
2. stage-1 recovery: add `stars:>5000 pushed:>2024-01-01`
3. stage-2 recovery: add `stars:>1000 pushed:>2022-01-01`

If a lane remains `raw_count == 0`, set `lane_status: degraded` and include `degraded_causes: ["no-results"]` with exact attempted queries.

## Promotion gates
- lane-intent token overlap required
- negation-aware guard (`no cli`, `without cli`, `non-cli`)
- generic personal repo guard (`portfolio|homework|assignment|demo`)
- metadata gate: non-archived, license present, freshness <= 24 months
- signal floor: stars >= 3 unless explicit exception rationale

## Provenance labels
Use validator-accepted labels directly in markdown: `indexed snippet`, `direct page retrieval`, `thin evidence`, `feed recovery`, `browser-rendered retrieval`, `browser-rendered indexed snippet`.
