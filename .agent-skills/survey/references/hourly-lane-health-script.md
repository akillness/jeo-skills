# Hourly Lane Health Script

Use this helper to extract compact lane metrics from `.survey/<slug>/evidence.json`.

## Purpose
- deterministic lane metric extraction for RTK summary inputs
- prevents manual count mistakes after recovery-query switches

## Command
```bash
python3 .agent-skills/survey/scripts/compute_lane_health.py .survey/<slug>/evidence.json
```

## Output Columns
- lane
- raw_count
- kept_count
- zero_star_raw
- median_stars_raw
- status (supports `status` and legacy `lane_status` keys)
- degraded_causes (auto-adds `no-results` when `raw_count == 0`)
- integrity (`ok` or impossible-state flags such as `invalid-kept-gt-raw`)

## Usage Pattern
1. Generate survey evidence.
2. Run the script and save output under `.survey/<slug>/lane-health.csv`.
3. Feed this compact output into `rtk summary`.
