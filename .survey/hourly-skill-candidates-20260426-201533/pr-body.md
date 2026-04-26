## Summary
- Ran hourly repo-maintenance survey using the required 5 keyword families (`agentic ai skill`, `web frontend skill`, `web backend skill`, `cli open source skill`, `game development skill`).
- Added a low-risk survey hardening ratchet: cross-lane raw-quality collapse trigger (`aggregate_zero_star_ratio >= 0.50`) and explicit degraded-cause label `low-signal-saturation`.
- Updated both the survey reference guide and the core survey skill contract for consistency.
- Generated required run artifacts: survey files, RTK summary, Graphify refinement (with documented fallback), Obsidian note fallback write, and LLM-wiki filing.

## What changed
1. `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
   - Added cross-lane trigger: `aggregate_zero_star_ratio >= 0.50`.
   - Added one deterministic cross-lane recovery query template.
   - Extended degraded-cause taxonomy with `low-signal-saturation`.
2. `.agent-skills/survey/SKILL.md`
   - Synced objective recovery-trigger language with aggregate trigger.
   - Synced degraded-cause taxonomy with `low-signal-saturation`.
3. LLM-wiki updates
   - Added query note: `llm-wiki/queries/2026-04-26-hourly-survey-raw-quality-collapse-ratchet.md`
   - Updated `llm-wiki/index.md` and `llm-wiki/log.md`.
4. Survey run artifacts
   - `.survey/hourly-skill-candidates-20260426-201533/{triage,context,solutions,platform-map,evidence,rtk-summary,graphify-refined,validation,pr-body}.md/json/txt`

## Evidence (survey-based)
- Primary run evidence: `.survey/hourly-skill-candidates-20260426-201533/evidence.json`
- Structured findings: `.survey/hourly-skill-candidates-20260426-201533/solutions.md`
- RTK token-saving summary: `.survey/hourly-skill-candidates-20260426-201533/rtk-summary.md`
- Graphify refinement artifact: `.survey/hourly-skill-candidates-20260426-201533/graphify-refined.json`
- Graphify query failure record: `.survey/hourly-skill-candidates-20260426-201533/graphify-query.err`

## Validation / quality checks
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260426-201533 --platform-topic --require-provenance` ✅ PASS
- `python3 -m json.tool .survey/hourly-skill-candidates-20260426-201533/graphify-refined.json` ✅ PASS
- `git diff --check` ✅ PASS

## Risks
- Minor policy strictness increase may mark some runs degraded earlier when discovery quality collapses.
- Added cross-lane recovery query can increase one extra search step in degraded runs.

## Rollback plan
- Revert commit to restore previous trigger/taxonomy behavior.
- Specifically revert edits in:
  - `.agent-skills/survey/SKILL.md`
  - `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`

## Self-review checklist
- [x] Change is non-destructive and documentation/contract scoped.
- [x] Survey evidence produced from required keyword sweep.
- [x] RTK, Graphify, Obsidian, and LLM-wiki steps executed with artifacts.
- [x] Validation outputs recorded.
- [x] Rollback path documented.
