# Hourly survey zero-star saturation guard ratchet

## Context
In hourly candidate sweeps, some lanes can appear healthy by kept_count while raw evidence remains dominated by zero-star repositories and near-zero traction.

## Observation from this run
- Agentic lane produced many lexical matches and high kept_count, but quality signals were weak in raw metrics.
- Existing lane metrics were recorded, but pass/degraded decision needed an explicit saturation guard to prevent pass-by-count drift.

## Change
- Added a zero-star saturation guard to survey skill guidance:
  - if `zero_star_raw / raw_count >= 0.70` and `median_stars_raw == 0`, do not keep `lane_status: pass` by count alone.
  - require explicit traction rationale for promoted keeps; otherwise mark degraded with `low-signal`.
- Synced this rule across:
  - `.agent-skills/survey/SKILL.md`
  - `.agent-skills/survey/SKILL.toon`
  - `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
  - `.agent-skills/survey/evals/evals.json` (new eval case id 20)

## Artifacts
- Survey folder: `.survey/hourly-skill-candidates-20260427-040739`
- RTK summary: `.survey/hourly-skill-candidates-20260427-040739/rtk-summary.md`
- Graphify outputs: `.survey/hourly-skill-candidates-20260427-040739/graphify-refined.json`, `.survey/hourly-skill-candidates-20260427-040739/graphify-memory/`

## Risk / rollback
- Risk: very low (documentation/eval ratchet only).
- Rollback: revert this commit.
