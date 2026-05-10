# Hourly Artifact Completeness Gate

Purpose: fail unattended hourly runs early when mandatory deliverable artifacts are missing from `.survey/<slug>/`.

## Why

Validator checks headings and provenance in markdown, but cron packaging can still miss expected files (for example `graphify-refined.json`, `rtk-summary.md`, or delivery reports) when one helper step silently fails. This gate enforces a deterministic required-file contract before PR packaging/merge decisions.

## Script

```bash
python3 .agent-skills/survey/scripts/validate_hourly_artifact_completeness.py \
  .survey/<slug> .survey/<slug>/artifact-completeness.json
```

- Exit `0`: all required artifacts present.
- Exit `1`: one or more required artifacts missing.
- Exit `2`: CLI usage error.

## Required artifacts (default set)

- evidence.json
- triage.md / context.md / solutions.md / platform-map.md
- rtk-summary.md
- graphify-refined.json
- obsidian-note.md
- llm-wiki-note.md
- hourly-run-report.json
- delivery-report.md
- lane-health.md / lane-health.json
- deduped-recommendations.json
- lane-degradation-report.md / lane-degradation-report.json
- lane-quality-gate.json
- recovery-stage-coverage.json
- ci-bootstrap-readiness.json

## Integration

Preferred: call the gate from `generate_hourly_audit_bundle.py` after report generation and before PR body/comment generation.

This keeps failure mode explicit and writes `artifact-completeness.json` for reviewer auditability.
