# Hourly Recent-Window Query Presets (24h~7d)

Use this reference for hourly repo-maintenance survey runs that must prioritize fresh signals while preserving deterministic fallback behavior.

## Primary recency windows

1. **Stage A (24h focus)**
   - Query template:
     - `"<lane phrase>" pushed:>=<UTC_DATE_MINUS_1D> archived:false`
   - Goal: catch newly active repositories with immediate momentum.

2. **Stage B (7d expansion)**
   - Query template:
     - `"<lane phrase>" pushed:>=<UTC_DATE_MINUS_7D> archived:false`
   - Goal: avoid over-sparsity from strict 24h windows.

3. **Stage C (lane recovery)**
   - Trigger: lane remains sparse/noisy (`raw_count==0` or `kept_count==0` after Stage B).
   - Query template examples:
     - `"<lane phrase>" stars:>5000 pushed:>=<UTC_DATE_MINUS_30D> archived:false`
     - `"<lane phrase>" stars:>1000 archived:false`

## Required recording fields

For each lane, persist:
- `query_primary`
- `recovery_attempts[]` with stage label and exact query string
- `raw_count`, `kept_count`, `median_stars_raw`, `zero_star_raw`
- `lane_status` and `degraded_causes`

## Guardrails

- Keep broad discovery evidence, but recommendation-grade keeps must still satisfy:
  - license known
  - freshness (`pushed_at` within 24 months unless explicit exception)
  - traction signal (`stars>=3` or documented exception)
  - lane-intent token overlap and negation-aware fit guard
- If a lane remains empty after documented recovery, include `no-results` in `degraded_causes`.
- Use validator-accepted provenance labels in markdown (e.g., `indexed snippet`, `direct page retrieval`).
