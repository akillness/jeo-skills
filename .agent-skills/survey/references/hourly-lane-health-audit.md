# Hourly Lane Health Audit

Use this checklist in hourly survey maintenance runs before PR creation.

## Purpose
- Keep five mandatory lanes auditable even when one lane is sparse/noisy.
- Prevent impossible metric states (`kept_count > raw_count`).
- Make degraded status deterministic for reviewers.

## Required checks
1. **Lane coverage**
   - Lanes: `agentic ai skill`, `web frontend skill`, `web backend skill`, `cli open source skill`, `game development skill`.
2. **Recovery transcript**
   - If lane `raw_count == 0`, persist stage-1 and stage-2 recovery queries.
   - If still zero, set `lane_status: degraded` and `degraded_causes: ["no-results"]`.
3. **Signal floor**
   - Recommendation-grade keep requires at least one traction signal (default stars >= 3) or explicit exception rationale + risk note.
4. **Lane intent gate**
   - Require token overlap between lane intent and repo name/description.
   - If only negated intent appears (e.g. `no cli`, `without cli`, `not a cli`, `non-cli`), classify `low-fit` by default.
5. **Freshness gate**
   - Keep candidates should be active within 24 months by `pushed_at` (or `updated_at` fallback with risk note).
6. **Concentration check**
   - Compute `recommended_lane_count`; if `< 2`, report `single_lane_concentration: true` and avoid broad-coverage claims.

## Minimal reviewer-facing output
- Lane metrics table (`raw_count`, `kept_count`, `zero_star_raw`, `median_stars_raw`, `lane_status`, `degraded_causes`).
- At least one low-fit filtered example count per affected lane.
- Provenance label in markdown text (e.g. `indexed snippet`, `direct page retrieval`).
