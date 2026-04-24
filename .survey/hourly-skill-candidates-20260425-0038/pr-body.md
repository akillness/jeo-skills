## Summary
This PR hardens the `survey` skill for recurring repo-maintenance cron loops by adding an explicit hourly candidate sweep step and rescue guidance.

### What changed
- `survey` skill (`SKILL.md`) now includes **Step 4.6** with mandatory keyword families:
  - `agentic ai skill`
  - `web frontend skill`
  - `web backend skill`
  - `cli open source skill`
  - `game development skill`
- Added execution rules for relevance-gated candidate retention and GitHub-native fallback (`gh search`/`gh api`/`gh repo view`) when search/extract tooling is degraded.
- Added new reference doc:
  - `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
- Updated compact variant (`SKILL.toon`) to encode the same behavior.
- Added eval case `id: 7` to lock this behavior.
- Added this run’s reusable survey artifacts under:
  - `.survey/hourly-skill-candidates-20260425-0038/`
- Saved Graphify memory entry for the run decision.

## Evidence (survey-based)
Discovery and triage artifacts:
- `.survey/hourly-skill-candidates-20260425-0038/evidence.json`
- `.survey/hourly-skill-candidates-20260425-0038/triage.md`
- `.survey/hourly-skill-candidates-20260425-0038/context.md`
- `.survey/hourly-skill-candidates-20260425-0038/solutions.md`
- `.survey/hourly-skill-candidates-20260425-0038/platform-map.md`

Key finding from this run:
- Some required keyword families were sparse/empty (`web backend skill`, `cli open source skill`), so explicit fallback and seed-rescue guidance is necessary for stable hourly quality.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260425-0038 --platform-topic --require-provenance` ✅
- `python3 -m json.tool .agent-skills/survey/evals/evals.json` ✅
- `python3 -m json.tool .survey/hourly-skill-candidates-20260425-0038/evidence.json` ✅
- `python3 -m json.tool .survey/hourly-skill-candidates-20260425-0038/graphify-refined.json` ✅

## Risks
- Slightly stricter guidance may increase survey runtime for some unattended runs.
- Keyword-family requirement can still return noisy data; this is mitigated by relevance gating and explicit metadata minimum.

## Rollback Plan
If this guidance causes regressions or excessive noise:
1. Revert this PR (single-PR rollback).
2. Keep only relevance-gate wording while disabling mandatory keyword-family requirement.
3. Re-run hourly survey and compare artifact quality before reintroducing stricter rules.
