# Hourly Evidence Builder Syntax Guard

Use this guard when touching `.agent-skills/survey/scripts/build_hourly_evidence.py`.

## Why

The hourly loop depends on this script to materialize `evidence.json` for all five mandatory lanes.
A tiny syntax slip can silently break every unattended run.

## Guard Steps

1. Run parser check before commit:

```bash
python3 -m py_compile .agent-skills/survey/scripts/build_hourly_evidence.py
```

2. Run a smoke build with a fresh slug:

```bash
SLUG=hourly-skill-candidates-<timestamp>
mkdir -p .survey/$SLUG
python3 .agent-skills/survey/scripts/generate_hourly_lane_queries.py > .survey/$SLUG/lane-queries.json
export SLUG
python3 .agent-skills/survey/scripts/build_hourly_evidence.py
```

3. Validate contract immediately:

```bash
python3 .agent-skills/survey/scripts/validate_hourly_evidence_contract.py .survey/$SLUG/evidence.json
```

4. Keep only slug-local file changes (`.survey/<slug>/...`) plus intentional script/docs edits.

## Failure Recovery

- If parser check fails, fix syntax first; do not continue to artifact generation.
- If smoke build fails with missing slug/query files, regenerate `lane-queries.json` and re-export `SLUG` in the same shell scope.
- If contract validation fails, repair lane key names/recovery stage entries before PR steps.
