# Hourly Delivery Report Generator

## Purpose
Generate a deterministic final markdown report for unattended hourly survey runs, with explicit separation between:
- development/procedural improvements,
- maintenance-only updates,
- merge/blocker decision.

This avoids ad-hoc summaries and enforces reviewer-visible merge gating.

## Command
```bash
python3 .agent-skills/survey/scripts/generate_hourly_delivery_report.py .survey/<slug> <checks_status>
```

`checks_status` values:
- `green`
- `no-checks-reported`
- any other status string (treated as blocked)

## Output
- `.survey/<slug>/delivery-report.md`

## Behavior
- Reads `.survey/<slug>/evidence.json`
- Summarizes lane concentration and degraded lane causes
- Emits a merge decision section with explicit blocker text

## Why this is useful
- Keeps cron outputs stable and audit-friendly
- Makes no-checks-reported merge block explicit
- Reduces manual report-writing drift between hourly runs
