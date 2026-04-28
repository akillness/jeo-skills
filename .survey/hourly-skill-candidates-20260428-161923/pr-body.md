## Summary
- Ran hourly survey loop with search-based research and evidence capture.
- Added low-risk hardening to survey relevance gate: explicit CLI negation phrases (`no cli`, `without cli`, `not a cli`, `non-cli`) are low-fit by default unless exception rationale is documented.
- Updated `survey` skill bundle files (`SKILL.md`, `SKILL.toon`, `evals/evals.json`, reference guide).
- Produced RTK summary, Graphify fallback artifact, Obsidian fallback note, and LLM-Wiki update.

## Evidence
- Survey package: `.survey/hourly-skill-candidates-20260428-161923/`
- Evidence: `.survey/hourly-skill-candidates-20260428-161923/evidence.json`
- RTK: `.survey/hourly-skill-candidates-20260428-161923/rtk-summary.md`
- Graphify: `.survey/hourly-skill-candidates-20260428-161923/graphify-refined.json`
- Obsidian status: `.survey/hourly-skill-candidates-20260428-161923/obsidian-status.txt`

## Risk
- Low: documentation/skill-policy changes only.
- Potential false-negative risk: some valid CLI-adjacent repos with negation phrasing may be deprioritized unless explicit exception rationale is provided.

## Rollback
1. Revert this PR commit.
2. If needed, selectively revert only:
   - `.agent-skills/survey/SKILL.md`
   - `.agent-skills/survey/SKILL.toon`
   - `.agent-skills/survey/evals/evals.json`
   - `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260428-161923 --platform-topic --require-provenance` ✅
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/survey` ✅
- `git diff --check` ✅
