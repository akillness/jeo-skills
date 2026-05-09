# RTK Lane Metrics Helper (hourly survey)

Use this helper when generating `rtk-summary.md` for `.survey/<slug>/evidence.json`.

## Why

`rtk summary` summarizes command output, not a file path. This helper prints deterministic lane metrics so hourly summaries remain consistent and compact.

## Command pattern

1) Print metrics:

```bash
python3 .agent-skills/survey/scripts/print_lane_metrics.py .survey/<slug>/evidence.json
```

2) If `rtk` is available, summarize the helper command output:

```bash
rtk summary "python3 .agent-skills/survey/scripts/print_lane_metrics.py .survey/<slug>/evidence.json" > .survey/<slug>/rtk-summary.md
```

3) If `rtk` is unavailable or errors, save raw helper output as fallback and note degraded RTK status in run report.

## Expected output fields
- lane
- raw
- kept
- zero_star
- median_stars
- status
- causes
- TOTAL raw/kept
- recommended_lane_count
- single_lane_concentration
