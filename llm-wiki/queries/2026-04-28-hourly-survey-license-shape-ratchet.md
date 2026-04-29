# Hourly survey license-shape normalization ratchet

## Summary
- Run slug: `hourly-skill-candidates-20260428-092907`
- Survey mode: mandatory 5-lane hourly candidate sweep (`agentic ai`, `web frontend`, `web backend`, `cli open source`, `game development`)
- RTK artifact: `.survey/hourly-skill-candidates-20260428-092907/rtk-summary.md`
- Graphify artifact: `.survey/hourly-skill-candidates-20260428-092907/graphify-refined.json`

## Observed issue
`gh search repos --json license` often returns license data as nested objects (`license.key`, `license.name`) rather than `spdx_id`.
If a workflow only checks `spdx_id`, valid candidates can be misclassified as unknown-license and lanes can be incorrectly degraded.

## Ratchet applied
1. Survey contract updated to normalize GitHub license payload shapes (`license.key`/`license.name`/`spdxId`) before unknown-license classification.
2. REST enrichment fallback remains required only when normalized first-pass fields are still unknown.
3. Added evaluator coverage so future cron runs keep lane-status fidelity under this schema shape.

## Run lane health snapshot
- agentic-ai: pass (`kept_count=3`, `raw_count=40`)
- web-frontend: degraded (`kept_count=0`, `raw_count=4`)
- web-backend: degraded (`kept_count=0`, `raw_count=2`)
- cli-open-source: pass (`kept_count=30`, `raw_count=40`)
- game-development: pass (`kept_count=1`, `raw_count=40`)
- recommended_lane_count: `3`
- single_lane_concentration: `false`

## Risk and rollback
- Risk: low (documentation/eval guidance only; no runtime codepath mutation in automation runner).
- Rollback: revert updates to `.agent-skills/survey/SKILL.md`, `SKILL.toon`, `references/keyword-sweep-and-relevance-rescue.md`, and `evals/evals.json`.
