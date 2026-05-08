# Solutions
## Solution List
1. Add reusable lane-health reporting script to compute deterministic metrics and concentration flags from evidence.json.
2. Keep strict recommendation gates (signal-floor, token overlap, negation-aware, stale/archive/license).
3. Continue blocker-comment policy when checks are absent.

## Categories
- Automation hardening
- Survey quality controls
- Merge safety gates

## What People Actually Use
- `gh search repos` with structured JSON fields for repeatable evidence capture.
- Python helper scripts for deterministic artifact generation.

## Frequency Ranking
1. no-checks-reported merge blocker
2. low-fit candidate filtering burden
3. lane concentration blind spots

## Key Gaps
- Missing compact script-based lane metric report caused repeated manual parsing.

## Contradictions
- Broad search recall can conflict with recommendation precision; solved by preserve-raw/promote-filter split.

## Key Insight
- Development-first hourly cadence is best served by reusable scripts that transform evidence into review-ready signals.

Provenance labels: indexed snippet, direct page retrieval.
