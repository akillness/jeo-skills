## Summary
This hourly run executed the mandatory five-lane survey and applied a low-risk hardening update to the `survey` skill package.

Primary ratchets in this PR:
1. Add deterministic `no-results` degraded-cause handling for lanes that remain `raw_count == 0` after documented recovery.
2. Require raw-vs-deduplicated recommendation coverage reporting before final ranking, while preserving raw discovery evidence.
3. Propagate the above contract changes across `SKILL.md`, `SKILL.toon`, reference guidance, and eval coverage.

## Survey evidence and artifacts
Run slug: `hourly-skill-candidates-20260427-020134`

Artifacts:
- `.survey/hourly-skill-candidates-20260427-020134/evidence.json`
- `.survey/hourly-skill-candidates-20260427-020134/triage.md`
- `.survey/hourly-skill-candidates-20260427-020134/context.md`
- `.survey/hourly-skill-candidates-20260427-020134/solutions.md`
- `.survey/hourly-skill-candidates-20260427-020134/platform-map.md`
- `.survey/hourly-skill-candidates-20260427-020134/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260427-020134/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260427-020134/graphify-query.err`

Observed lane metrics from this run:
- agentic ai skill: raw=30, kept=3
- web frontend skill: raw=4, kept=0
- web backend skill: raw=0, kept=0
- cli open source skill: raw=1, kept=1
- game development skill: raw=30, kept=1

Run-level metrics:
- raw_cross_lane_duplicate_count=0
- kept_cross_lane_duplicate_count=0
- recommended_lane_count=3
- single_lane_concentration=false

## Knowledge pipeline execution
- RTK: generated `rtk-summary.md` from structured lane-metrics command output.
- Graphify: `graphify query` failed with `error: could not load graph: 'links'`; fallback graph artifact was generated and retained (`graphify-refined.json`) with provenance.
- Obsidian CLI: run note attempted via `obsidian-cli create`; fallback-safe path logging recorded in `.survey/.../obsidian-note-path.txt`.
- LLM-Wiki: added query note and updated index/log:
  - `llm-wiki/queries/2026-04-27-hourly-survey-no-results-dedup-metrics-ratchet.md`
  - `llm-wiki/index.md`
  - `llm-wiki/log.md`

## Changes
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/SKILL.toon`
- `.agent-skills/survey/evals/evals.json`
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`

## Risks
- Low risk, docs-and-contract hardening only.
- No runtime codepaths or external interfaces changed.
- Potential risk: stricter taxonomy/reporting language can require downstream template updates in other automation if they assumed older degraded-cause vocabulary.

## Rollback plan
- Revert this PR commit to restore the previous survey taxonomy/rules.
- If partial rollback is needed, first revert:
  1) `.agent-skills/survey/SKILL.md`
  2) `.agent-skills/survey/SKILL.toon`
  3) `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
  4) `.agent-skills/survey/evals/evals.json`

## Validation
Executed:
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260427-020134 --platform-topic --require-provenance`
- `python3 -m json.tool .agent-skills/survey/evals/evals.json`
- `python3 -m json.tool .survey/hourly-skill-candidates-20260427-020134/evidence.json`
- `python3 -m json.tool .survey/hourly-skill-candidates-20260427-020134/graphify-refined.json`
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey`
- `git diff --check`

All commands passed.
