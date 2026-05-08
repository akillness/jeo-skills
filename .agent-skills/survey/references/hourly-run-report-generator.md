# Hourly Run Report Generator

Use `.agent-skills/survey/scripts/generate_hourly_run_report.py` to derive compact lane-health JSON from `.survey/<slug>/evidence.json`.

## Why
- Provides deterministic machine-readable summary for PR body and blocker comments.
- Avoids repeatedly parsing large evidence payloads in unattended cron runs.

## Command
```bash
python3 .agent-skills/survey/scripts/generate_hourly_run_report.py .survey/<slug>
```

## Output
Writes `.survey/<slug>/hourly-run-report.json` with:
- lane status table (`pass` or `degraded`)
- per-lane `raw_count`, `kept_count`, and `median_stars_raw`
- `recommended_lane_count`
- `single_lane_concentration`
- explicit degraded lane causes
