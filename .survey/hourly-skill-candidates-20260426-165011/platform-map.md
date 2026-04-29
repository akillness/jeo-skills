# Platform Map

## Settings
- Survey recovery query examples should reference a rolling 24-month cutoff variable rather than fixed calendar dates.

## Rules
- Recommendation-grade keeps require freshness alignment with the documented 24-month policy.
- Keep deterministic stage-1/stage-2 escalation behavior unchanged.

## Hooks
- Optional pre-query helper can compute `ROLLING_CUTOFF` once per run and inject it into all recovery queries.

## Platform Gaps
- Existing examples still use `pushed:>=2024-01-01`, creating drift against the freshness rule.

## Provenance
- direct page retrieval
- indexed snippet
