# 2026-04-25 Hourly Survey Recovery-Template Ratchet

## Run Context
- Run slug: `hourly-skill-candidates-20260424-201528`
- Primary mode: repo-maintenance survey
- Retrieval method: GitHub-native search (`gh search repos`) with `direct page retrieval` provenance
- Obsidian CLI status: unavailable in headless runner (`obsidian: command not found`), so note persisted by direct markdown write fallback.

## Evidence
- Survey evidence JSON: `../../.survey/hourly-skill-candidates-20260424-201528/evidence.json`
- Survey summary: `../../.survey/hourly-skill-candidates-20260424-201528/rtk-summary.md`
- Graphify memory note: `../../graphify-out/memory/query_20260424_201621_hourly_survey_run_2026_04_25__what_low_risk_survey.md`

## Distilled Findings
1. Five mandatory keyword lanes were executed and artifact validation passed.
2. Noisy/sparse lane behavior still benefits from explicit fallback query templates.
3. Lowest-risk improvement is doc-level hardening of lane recovery templates and lane-level threshold reporting.

## Applied Evolution
- Updated `survey` skill guidance to require lane-specific recovery template use when lanes are sparse/noisy.
- Added lane-level recommendation threshold reporting (>=1 keep/lane where feasible; CLI lane target 3+).
- Added eval coverage to prevent regression of this behavior in future loops.
