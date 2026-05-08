# Hourly deduped recommendations utility

Use this helper to produce reviewer-friendly recommendation coverage metrics after five-lane discovery.

## Why
Raw recommendation lists can repeat the same repository across multiple lanes. This script keeps raw evidence intact while producing a deduplicated recommendation-grade view for audit summaries.

## Command

```bash
python3 .agent-skills/survey/scripts/dedupe_hourly_recommendations.py \
  .survey/<slug>/evidence.json \
  .survey/<slug>/deduped-recommendations.json
```

## Output contract
`deduped-recommendations.json` includes:
- `recommended_raw_count`
- `recommended_dedup_count`
- `deduped_recommendations[]` with `first_lane` and `also_seen_in_lanes`

## Provenance guidance
- Keep discovery provenance in `evidence.json` unchanged.
- Treat this output as aggregation-only metadata for reviewer readability.
