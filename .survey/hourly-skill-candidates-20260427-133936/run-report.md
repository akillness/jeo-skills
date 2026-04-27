# Hourly Run Report: hourly-skill-candidates-20260427-133936

- Generated at: 2026-04-27T13:39:36.726914+00:00
- Repo: https://github.com/akillness/oh-my-skills
- Provenance mode: indexed snippet / direct page retrieval

## Keyword sweep status
- agentic-ai-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=3810, zero_star_raw=0, degraded_causes=none
- web-frontend-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=29, zero_star_raw=0, degraded_causes=none
- web-backend-skill: lane_status=pass, kept_count=1, raw_count=15, median_stars_raw=9, zero_star_raw=2, degraded_causes=none
- cli-open-source-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=26, zero_star_raw=0, degraded_causes=none
- game-development-skill: lane_status=pass, kept_count=5, raw_count=15, median_stars_raw=22, zero_star_raw=0, degraded_causes=none

## RTK + Graphify + Obsidian + LLM-Wiki
- RTK summary: `.survey/hourly-skill-candidates-20260427-133936/rtk-summary.md`
- Graphify refined output: `.survey/hourly-skill-candidates-20260427-133936/graphify-refined.json` (fallback generated)
- Graphify query error captured: `error: graph file not found: /private/tmp/oh-my-skills-20260427-223416/.survey/hourly-skill-candidates-20260427-133936/graphify-memory/graph.json`
- Obsidian note: to be filed after PR packaging
- LLM-Wiki report: to be filed after PR packaging

## Implemented repo changes
- survey skill hardening: negation-aware lane-intent guard (`no cli` / `without cli` / `not a cli` / `non-cli`) for recommendation-grade promotion
- synced survey metadata packs: `.agent-skills/survey/SKILL.md`, `SKILL.toon`, `evals/evals.json`
- updated reference guide: `references/keyword-sweep-and-relevance-rescue.md`

## Validation
- `validate_survey_artifacts.py --platform-topic --require-provenance`: PASS
- `git diff --check`: PASS
- `validate_skill.sh .agent-skills/survey`: PASS

## Risk and rollback
- Risk: negation guard may over-filter rare repos that mention a lane token in mixed contexts.
- Mitigation: guard only affects recommendation-grade promotion; raw discovery evidence remains preserved.
- Rollback: revert the four edited survey files in a single commit.
