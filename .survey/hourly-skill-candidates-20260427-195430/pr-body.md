## Summary
- Hardened `.agent-skills/survey` guidance for unattended hourly loops by codifying an explicit guard for `gh search repos` empty-success payloads (`[]` with exit 0) and deterministic REST fallback (`gh api "search/repositories?..."`).
- Added/updated survey run artifacts for reproducible evidence:
  - `.survey/hourly-skill-candidates-20260427-1828/` (carry-forward unmerged run)
  - `.survey/hourly-skill-candidates-20260427-195430/` (current run)
- Updated LLM-Wiki index/log and query notes with this run’s rationale and carry-forward merge handling.

## Research Evidence (survey-based)
- Current run artifacts:
  - `.survey/hourly-skill-candidates-20260427-195430/triage.md`
  - `.survey/hourly-skill-candidates-20260427-195430/context.md`
  - `.survey/hourly-skill-candidates-20260427-195430/solutions.md`
  - `.survey/hourly-skill-candidates-20260427-195430/evidence.json`
  - `.survey/hourly-skill-candidates-20260427-195430/raw/*`
- Carry-forward run artifacts:
  - `.survey/hourly-skill-candidates-20260427-1828/*`
- External source links:
  - https://cli.github.com/manual/gh_search_repos
  - https://docs.github.com/en/rest/search/search#search-repositories

## RTK / Graphify / Obsidian / LLM-Wiki
- RTK summary: `.survey/hourly-skill-candidates-20260427-195430/rtk-summary.md`
- Graphify refined output: `.survey/hourly-skill-candidates-20260427-195430/graphify-refined.json`
- Graphify query logs: `.survey/hourly-skill-candidates-20260427-195430/graphify-query.{txt,err}`
- Obsidian status: `.survey/hourly-skill-candidates-20260427-195430/obsidian-status.txt` (direct-write fallback used)
- LLM-Wiki updates:
  - `llm-wiki/queries/2026-04-27-hourly-survey-gh-search-empty-payload-ratchet.md`
  - `llm-wiki/queries/2026-04-27-hourly-survey-merge-carry-forward.md`
  - `llm-wiki/index.md`
  - `llm-wiki/log.md`

## Verification
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260427-1828 --platform-topic --require-provenance`
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260427-195430 --platform-topic --require-provenance`
- `python3 -m json.tool .agent-skills/survey/evals/evals.json`
- `python3 -m json.tool .survey/hourly-skill-candidates-20260427-195430/graphify-refined.json`

## Risks
- Large artifact commit (survey evidence snapshots) increases PR size and review surface.
- Graphify query command remains environment-sensitive; fallback artifact generation is relied on when query fails.

## Rollback Plan
- Revert this PR commit to restore previous survey skill text and remove added artifacts.
- If needed, selectively revert only guidance lines in:
  - `.agent-skills/survey/SKILL.md`
  - `.agent-skills/survey/SKILL.toon`
  - `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
  - `.agent-skills/survey/evals/evals.json`
