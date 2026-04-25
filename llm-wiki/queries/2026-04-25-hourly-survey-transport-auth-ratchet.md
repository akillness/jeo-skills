# Hourly survey transport/auth degraded-cause ratchet

## Question
In hourly survey runs, what low-risk change should we make when external web search fails with auth/transport errors but GitHub-native fallback still works?

## Answer
Add `transport/auth` to the `degraded_causes` compact taxonomy used in lane-level reporting.

## Why
- This run observed repeated `web_search` failures with `401 INVALID_API_KEY`.
- GitHub-native fallback (`gh search repos`, `gh repo view`) still produced recommendation-grade evidence.
- Existing taxonomy (`license|stale|low-fit|archived`) captures content quality but not retrieval infrastructure failures.

## Evidence
- Survey artifacts: `.survey/hourly-survey-2026-04-25-1322/`
- Graph memory: `graphify-out/memory/query_20260425_042751_hourly_survey_run_2026_04_25__what_low_risk_survey.md`
- Updated skill files under `.agent-skills/survey/`

## Decision
Adopted in this run by patching:
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/SKILL.toon`
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
- `.agent-skills/survey/evals/evals.json`
