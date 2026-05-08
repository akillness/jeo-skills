# Lane Health Markdown Renderer

Use this utility to convert hourly `evidence.json` lane metrics into a compact markdown table for PR reviewers.

## Why
- Keeps lane-health reporting deterministic.
- Avoids manual metric transcription drift.
- Produces lightweight reviewer evidence in checks-degraded runs.

## Command

```bash
python3 .agent-skills/survey/scripts/render_lane_health_markdown.py \
  .survey/<slug>/evidence.json \
  .survey/<slug>/lane-health.md
```

## Output
- `# Lane Health Summary` table with:
  - `raw_count`
  - `kept_count`
  - `zero_star_raw`
  - `median_stars_raw`
  - `lane_status`
  - `degraded_causes`

## Notes
- Input must follow the hourly evidence contract (`lanes` map + metrics fields).
- Provenance labels are included in markdown (`indexed snippet`, `feed recovery`).
