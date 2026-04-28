# GH Search Empty-Lane Recovery Playbook

Use this playbook in hourly survey runs when `gh search repos` returns an empty list for a mandatory lane.

## Trigger
- Lane query exit code is 0 but payload is `[]`
- Or lane has `raw_count == 0` after the primary query

## Mandatory recovery sequence
1. Keep original lane output as discovery evidence.
2. Run stage-1 recovery query with stars/freshness constraints.
3. If still `raw_count == 0`, run exactly one stage-2 query for the lane.
4. If GH search remains empty/noisy, run REST fallback:
   - `gh api "search/repositories?q=<query>&per_page=20&sort=updated&order=desc"`
5. Recompute lane metrics from the final selected result set before writing `evidence.json`.

## Required evidence notes
- `lane_status: degraded` with cause `no-results` when lane remains empty after documented recovery.
- `transport_status` note only when all five lanes are zero due to retrieval degradation.
- Provenance label must use validator-supported terms (`indexed snippet`, `direct page retrieval`, etc.).

## Validation checklist
- `raw_count >= kept_count`
- if `raw_count == 0`: set `zero_star_raw = 0` and `median_stars_raw = 0`
- run `validate_survey_artifacts.py --platform-topic --require-provenance`
