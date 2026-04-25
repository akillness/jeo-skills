## Summary
- Ran mandatory hourly 5-lane survey for `akillness/oh-my-skills` and generated full artifact bundle under `.survey/hourly-skill-candidates-20260425-075308/`.
- Hardened survey guidance with deterministic **stage-2 recovery escalation** for lanes that remain `raw_count == 0` after stage-1 recovery.
- Updated survey skill contract + eval coverage to keep unattended cron behavior deterministic and reviewer-verifiable.

## What changed
1. Survey run artifacts (evidence + knowledge pipeline)
   - Added `.survey/hourly-skill-candidates-20260425-075308/` files:
     - `evidence.json`, `triage.md`, `context.md`, `solutions.md`, `platform-map.md`
     - `rtk-summary.md`
     - `graphify-refined.json` + fallback notes/logs
     - `obsidian-note.md`
2. Survey skill hardening
   - `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
     - Added backend lane stage-2 recovery query template.
     - Added explicit stage-2 escalation rule (`raw_count == 0` after stage-1).
   - `.agent-skills/survey/SKILL.md`
     - Added explicit stage-2 escalation instruction in hourly lane sweep section.
   - `.agent-skills/survey/SKILL.toon`
     - Synced usage/steps/rules wording for stage-2 deterministic escalation.
   - `.agent-skills/survey/evals/evals.json`
     - Added eval id=16 for stage-2 backend escalation expectations.
3. LLM-Wiki note in repo
   - `llm-wiki/queries/2026-04-25-hourly-survey-stage2-backend-recovery.md`

## Survey evidence and provenance
- Run slug: `hourly-skill-candidates-20260425-075308`
- Provenance label used: `direct page retrieval (GitHub search API)`
- Mandatory lanes executed:
  - `agentic ai skill` → pass (kept 6 / raw 33)
  - `web frontend skill` → degraded (kept 0 / raw 4)
  - `web backend skill` → degraded (kept 0 / raw 0)
  - `cli open source skill` → degraded (kept 2 / raw 5, threshold 3)
  - `game development skill` → pass (kept 1 / raw 30)

## Risk
- Low-risk, documentation/policy + eval updates only.
- No runtime code-path changes.
- Primary behavior change is stricter deterministic query escalation guidance in survey docs.

## Rollback plan
- Revert this PR commit (single squash) to restore prior survey guidance and eval set.
- No data migration or stateful rollback needed.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260425-075308 --platform-topic --require-provenance` ✅
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` ✅
- `git diff --check` ✅
