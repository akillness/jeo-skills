## Solution List
- Candidate A (selected): In survey docs/checklists, require capturing `web_search` transport error envelope (`requestId`, `tag`, status code) into `transport_status` artifact when API auth failures occur.
- Candidate B: Expand Obsidian fallback examples for CLI flag drift.
- Candidate C: Add Graph schema fallback diagnostics examples.

## Categories
- reliability
- observability
- cron-resilience

## What People Actually Use
- Issue threads repeatedly include structured API error envelopes containing request IDs and tags for diagnostics.
- Automation workflows commonly rely on storing exact error payloads for reproducibility and audit.

## Frequency Ranking
1. INVALID_API_KEY / auth envelope occurrences in issue search results (highest)
2. Obsidian CLI flag drift reports
3. Graph links-key mismatch reports

## Key Gaps
- Current survey docs mention transport fallback but do not explicitly require preserving `requestId`/`tag` fields from failed web_search responses.

## Contradictions
- None material.

## Key Insight
- Persisting structured transport error envelopes improves deterministic debugging and postmortem traceability with minimal risk.

Provenance: direct page retrieval
