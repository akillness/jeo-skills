# Hourly Audit Bundle Generator

Script: `scripts/generate_hourly_audit_bundle.py`

## Purpose
Run all recurring post-evidence hourly audit/report generators in one deterministic command, with explicit output files under the active slug directory.

This reduces cron drift where individual scripts are invoked with wrong CLI shapes (positional vs flags) or stdout redirection is forgotten.

## Usage

```bash
python3 .agent-skills/survey/scripts/generate_hourly_audit_bundle.py .survey/<slug>
```

## Outputs

- `lane-health.md`
- `deduped-recommendations.json`
- `lane-health.json`
- `recovery-query-matrix.md`
- `lane-quality-gate.json`
- `intent-fit-audit.json`
- `recommendation-quality-audit.json`
- `freshness-audit.json`
- `run-report.md`
- `delivery-report.md`
- `audit-bundle-summary.json`

## Failure behavior

- Exits non-zero on the first failed subcommand.
- Prints the failing command and stderr.
- Does not auto-discover slug directories; caller passes explicit `.survey/<slug>` path.
