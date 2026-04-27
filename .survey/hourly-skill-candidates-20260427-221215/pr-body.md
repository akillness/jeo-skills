## Summary
This hourly run adds a low-risk survey-process ratchet: an **open-PR backlog preflight gate** for unattended hourly loops.

### What changed
- Updated `.agent-skills/survey/SKILL.md` to require backlog preflight before opening a new hourly PR.
- Updated `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md` with explicit threshold/action policy:
  - measure backlog with `gh pr list --state open --limit 100`
  - if hourly backlog `>= 10`, switch to merge carry-forward mode
  - still emit survey/RTK/graphify/obsidian artifacts
- Added new survey artifacts under `.survey/hourly-skill-candidates-20260427-221215/`.
- Added LLM-Wiki note + index/log updates for this ratchet.

## Evidence (survey-based)
- Keyword sweep (required 5 lanes): `agentic ai skill`, `web frontend skill`, `web backend skill`, `cli open source skill`, `game development skill`
- Evidence file: `.survey/hourly-skill-candidates-20260427-221215/evidence.json`
- Current run snapshot:
  - `open_pr_count = 29`
  - `recommended_lane_count = 3`
  - `aggregate_zero_star_ratio = 0.64`

## RTK / Graphify / Obsidian / LLM-Wiki
- RTK token-saving summary: `.survey/hourly-skill-candidates-20260427-221215/rtk-summary.md`
- Graphify:
  - `graphify save-result` succeeded
  - `graphify query` failed with `error: could not load graph: 'links'`
  - fallback artifact generated: `.survey/hourly-skill-candidates-20260427-221215/graphify-refined.json`
- Obsidian CLI:
  - URI create failed in headless mode (`Failed to execute Obsidian URI`)
  - direct-write fallback used, status in `.survey/hourly-skill-candidates-20260427-221215/obsidian-status.txt`
- LLM-Wiki updates:
  - `llm-wiki/queries/2026-04-27-hourly-survey-open-pr-backlog-gate-ratchet.md`
  - `llm-wiki/index.md`, `llm-wiki/log.md`

## Risk
- Low. Documentation/process-only ratchet; no runtime code path changes.
- Potential downside: fewer newly-opened PRs during high backlog periods.

## Rollback
- Revert this PR commit to remove backlog gate language and restore previous hourly behavior.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260427-221215 --platform-topic --require-provenance` ✅
- `git diff --check` ✅
