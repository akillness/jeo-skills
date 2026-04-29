## Summary
- Hardened `survey` hourly recovery templates to use a **rolling 24-month** cutoff variable (`ROLLING_CUTOFF`) instead of hardcoded `pushed:>=2024-01-01`.
- Ran mandatory survey artifact workflow and stored full evidence under `.survey/hourly-skill-candidates-20260426-165011/`.
- Added RTK token-optimized summary, Graphify refinement artifact (with documented fallback), Obsidian note handoff, and LLM-Wiki entry for iterative knowledge carryover.

## What changed
1. `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
   - Added reusable rolling-cutoff snippet.
   - Replaced all static fallback template dates with `${ROLLING_CUTOFF}`.
2. `.survey/hourly-skill-candidates-20260426-165011/*`
   - Added triage/context/platform-map/solutions/evidence/validation/RTK/Graphify artifacts.
3. `llm-wiki/*`
   - Added `2026-04-27-hourly-survey-rolling-cutoff-ratchet.md` and updated index/log.
4. `graphify-out/memory/*`
   - Stored this run’s graphify memory record.

## Evidence (search-based survey)
- gh/qualifier docs used as source links in artifact:
  - https://cli.github.com/manual/gh_search_repos
  - https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories
  - https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax
- Lane-level keyword sweep evidence captured in `.survey/.../evidence.json`.

## Risk
- **Low**: documentation/reference-only hardening.
- No runtime code path, no schema migration, no destructive operation.

## Rollback plan
- Revert commit `survey: ratchet rolling cutoff in recovery templates`.
- Specifically restore `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md` if partial rollback needed.

## Verification
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260426-165011 --platform-topic --require-provenance` ✅ PASS
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` ✅ 0 errors / 0 warnings
- `python3 -m json.tool .survey/hourly-skill-candidates-20260426-165011/graphify-refined.json` ✅ valid JSON

## Notes
- `graphify query` failed with `error: could not load graph: 'links'`; fallback artifact generated as required and failure stderr preserved in `.survey/.../graphify-query.err`.
- `obsidian-cli create` failed in headless mode (`Failed to execute Obsidian URI`); note was written directly to vault path as fallback.
