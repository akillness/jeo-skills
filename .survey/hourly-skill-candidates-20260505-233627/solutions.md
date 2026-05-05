## Solution List
1. Keep hard gate for 5 mandatory lanes with stage-1/2 recovery queries.
2. Apply intent token overlap + negation-aware guard before promotion.
3. Require license normalization/enrichment and 24-month freshness.
4. Persist lane health metrics and cross-lane concentration flags.

## Settings
- Freshness threshold: 24 months
- Signal floor: stars >= 3

## Rules
- No PR merge when checks are missing/failing.
- No recommendation-grade keep without license/freshness/signal gates.

## Hooks
- Hourly cron run with branch+PR lifecycle automation.
