# Lane Quality Gate Utility

Use `scripts/lane_quality_gate.py` to score a single keyword lane deterministically during hourly survey runs.

## Why
- Prevent ad hoc promotion decisions.
- Enforce the same gate set every run: token intent overlap, negation guard, generic-personal guard, freshness, signal floor, archive filter, license presence.
- Preserve metric integrity (`kept_count <= raw_count`).

## Input
JSON file:

```json
{
  "lane": "web-frontend-skill",
  "tokens": ["frontend", "react", "ui"],
  "repos": [ ... gh search repos rows ... ]
}
```

## Command
```bash
python3 .agent-skills/survey/scripts/lane_quality_gate.py \
  --input .survey/<slug>/lane-input.json \
  --output .survey/<slug>/lane-output.json
```

## Output fields
- `raw_count`
- `zero_star_raw`
- `median_stars_raw`
- `kept_count`
- `lane_status`
- `degraded_causes`
- `recommended`
- `low_fit_examples`

## Provenance
Use `indexed snippet` for search-list evidence and `direct page retrieval` if enriched with `gh repo view` or `gh api` details.
