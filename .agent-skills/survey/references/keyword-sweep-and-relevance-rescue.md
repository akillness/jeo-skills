# Keyword Sweep and Relevance Rescue (Hourly)

This reference defines deterministic behavior for the five mandatory hourly lanes:

- agentic ai skill
- web frontend skill
- web backend skill
- cli open source skill
- game development skill

## Staged query policy

1. stage-1: `<lane keyword> pushed:>=<window> archived:false`
2. stage-2: `<lane keyword> stars:>5 pushed:>=<window> archived:false`
3. stage-3: `<lane keyword> stars:>50 archived:false`

All attempts must be stored in `recovery_queries` in `evidence.json`, including zero-result attempts.

## Recommendation-grade filters

A candidate is recommendation-grade only when all pass:

- token overlap with lane intent (or explicit synonym rationale)
- not negation-only intent (e.g., `no cli`, `without cli`)
- not generic portfolio/demo/homework catch-all unless explicit exception rationale
- signal floor met (`stars >= 3` by default)
- freshness met (pushed within 24 months)
- repository not archived
- license resolved

## Degraded status taxonomy

Use `lane_status: degraded` with explicit causes from:

- `no-results`
- `license`
- `stale`
- `low-fit`
- `archived`
- `low-signal`

When `raw_count == 0`, include `no-results` in `degraded_causes`.

## Contract check

Run:

```bash
python3 .agent-skills/survey/scripts/validate_hourly_evidence_contract.py .survey/<slug>/evidence.json
```

Then run strict survey validator:

```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --platform-topic --require-provenance
```
