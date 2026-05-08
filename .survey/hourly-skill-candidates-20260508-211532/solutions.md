## Solution List
## Categories
- Validation hardening
- Evidence refresh

## What People Actually Use
- GitHub repository search via gh search repos with JSON fields.

## Frequency Ranking
1. Missing checks on open PR branch.
2. Need deterministic lane recovery metadata.

## Key Gaps
- Recovery query coverage was not strictly required for non-zero raw lanes.

## Contradictions
- High recall discovery can include low-fit repos; recommendation gate must remain strict.

## Key Insight
- Enforcing stage-1 and stage-2 recovery metadata on every lane improves reviewer auditability regardless of lane raw_count.
