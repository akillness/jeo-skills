# Triage

- Problem: Recovery query templates in survey use fixed `pushed:>=2024-01-01`, which drifts away from the documented rolling 24-month freshness policy.
- Audience: Maintainers running hourly survey-driven skill maintenance loops.
- Why now: As time passes, fixed-date templates increasingly admit stale repos and weaken recommendation quality.

## Signals
- Five required keyword families executed.
- Recovery templates currently embed static date floors.
- Existing freshness gate text already states rolling 24 months.

## Provenance
- direct page retrieval
- indexed snippet
