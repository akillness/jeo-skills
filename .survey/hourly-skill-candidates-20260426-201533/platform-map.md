# Platform Map
## Settings
- Keyword families fixed to five required lanes for hourly repo-maintenance surveys.
- Rolling freshness floor: pushed_at within 24 months.

## Rules
- Recommendation-grade keep requires non-archived, known license, freshness, and basic signal.
- Degraded lanes must carry explicit degraded causes.

## Hooks
- gh search repos for indexed discovery.
- gh api repos/<owner>/<repo> for license fallback.

## Platform Gaps
- Search quality drift can hide behind raw-count metrics without cross-lane quality checks.

## Provenance
- indexed snippet
- direct page retrieval
