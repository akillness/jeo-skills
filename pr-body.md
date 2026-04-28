## Summary
- Ran the hourly survey workflow and generated `.survey/hourly-skill-candidates-20260428-225337/` artifacts (evidence, RTK summary, Graphify fallback refinement).
- Added a low-risk carry-forward hardening ratchet: when selected PR has `mergeStateStatus: UNKNOWN`, do bounded re-checks before deciding; if still unknown, defer and move to next deterministic candidate with artifact trace.
- Updated LLM-Wiki index/log with this run’s ratchet note.

## What changed
- `.agent-skills/survey/SKILL.md`
  - Added explicit rule for `mergeStateStatus: UNKNOWN` handling in carry-forward mode.
- `.agent-skills/survey/SKILL.toon`
  - Synced compact rule set with UNKNOWN mergeability polling/defer behavior.
- `.agent-skills/survey/evals/evals.json`
  - Added eval case `id: 25` for UNKNOWN mergeability behavior.
- `.survey/hourly-skill-candidates-20260428-225337/*`
  - Added triage/context/solutions/platform-map/evidence/rtk-summary/graphify-refined artifacts.
- `llm-wiki/queries/2026-04-28-hourly-survey-unknown-mergeability-polling-ratchet.md`
  - Added run note and linked artifacts.
- `llm-wiki/index.md`, `llm-wiki/log.md`
  - Registered new query note and run log entry.

## Evidence / provenance
- Survey evidence: `.survey/hourly-skill-candidates-20260428-225337/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260428-225337/rtk-summary.md`
- Graphify refinement fallback: `.survey/hourly-skill-candidates-20260428-225337/graphify-refined.json`
- Provenance labels used in artifacts: `indexed snippet`, `direct page retrieval`

## Risk
- Low risk (documentation/eval/rules hardening only).
- Potential risk: slightly longer decision latency in carry-forward mode due to bounded re-checks.

## Rollback plan
1. Revert this PR commit.
2. Remove `.survey/hourly-skill-candidates-20260428-225337/` artifacts if rollback should keep tree clean.
3. Remove eval `id: 25` and UNKNOWN mergeability bullets from survey docs.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260428-225337 --platform-topic --require-provenance` ✅
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` ✅
- `git diff --check` ✅
