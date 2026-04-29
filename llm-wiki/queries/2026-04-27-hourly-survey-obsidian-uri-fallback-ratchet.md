# 2026-04-27 hourly survey obsidian-uri-fallback ratchet

## Query
What low-risk hardening should be merged so hourly survey runs do not treat Obsidian CLI URI failures as success when the command exits 0?

## Inputs
- `.survey/hourly-skill-candidates-20260427-160140/evidence.json`
- `.survey/hourly-skill-candidates-20260427-160140/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260427-160140/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260427-160140/graphify-query.err`
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/SKILL.toon`
- `.agent-skills/survey/evals/evals.json`

## Distilled findings
- This run observed `obsidian-cli create` printing `Failed to execute Obsidian URI` while returning exit code 0.
- Existing hourly survey quality gates covered transport fallback and lane health, but did not explicitly codify Obsidian false-success signature handling.
- Without this guard, run notes may be reported as persisted even when no Obsidian write occurred.

## Decision
- Add explicit survey hardening rule: treat Obsidian URI failure signatures as hard failure signals even on zero exit and fallback to deterministic direct markdown writes with recorded path.
- Add a dedicated companion skill `obsidian-cli-uri-fallback` for reusable cron/headless handling.

## Why low-risk
- Documentation/skill-logic hardening only; no runtime service or production API behavior changes.
- Rollback remains a clean git revert of updated markdown files.

## Relation to prior notes
- Extends transport-hardening lineage from `2026-04-27-hourly-survey-transport-taxonomy-ratchet.md` and `2026-04-27-hourly-survey-web-search-error-log-ratchet.md` into note-persistence reliability.

## Provenance
- direct page retrieval
- indexed snippet
