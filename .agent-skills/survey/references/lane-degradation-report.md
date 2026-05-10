# Lane Degradation Report Utility

Use `generate_lane_degradation_report.py` to produce deterministic degraded-lane summaries from hourly evidence.

## Why

Hourly carry-forward runs often need a compact reviewer-facing answer for:

- which lanes are degraded now,
- why they are degraded (`degraded_causes`),
- and whether lane metrics are trending worse.

This utility emits both markdown and JSON in one command so blocker comments and delivery reports can reuse the same source.

## Command

```bash
python3 .agent-skills/survey/scripts/generate_lane_degradation_report.py \
  .survey/<slug>/evidence.json \
  .survey/<slug>/lane-degradation-report.md \
  .survey/<slug>/lane-degradation-report.json
```

## Outputs

- `lane-degradation-report.md`
  - lane table with `status`, `kept/raw`, `median_stars_raw`, `zero_star_raw`, and `degraded_causes`
- `lane-degradation-report.json`
  - machine-readable mirror for CI/report pipelines

## Integration point

This utility is wired into `scripts/generate_hourly_audit_bundle.py` so unattended cron runs emit degradation artifacts automatically.
