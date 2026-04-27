# Hourly survey game-lane stage-2 ratchet

## Summary
This hourly run executed the mandatory five-lane survey and observed repeated `no-results` in `game-development-skill` even after lane recovery entrypoint checks. To keep unattended behavior deterministic, we ratcheted survey references to add an explicit stage-2 game-lane recovery template.

## Evidence
- Run slug: `hourly-skill-candidates-20260427-210144`
- recommended_lane_count: `2`
- game lane status: `degraded`
- game lane degraded_causes: `no-results`
- provenance labels used: `indexed snippet`, `direct page retrieval`

## Change
- Updated `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`:
  - game lane now has Stage 1 + Stage 2 documented queries.
- Updated `.agent-skills/survey/SKILL.md` and `SKILL.toon` to require explicit stage-2 template parity across mandatory lanes.
- Added eval `id=21` in `.agent-skills/survey/evals/evals.json` for game-lane stage-2 escalation behavior.

## Why it matters
This keeps cron runs merge-safe by removing ad-hoc query invention when one mandatory lane remains `raw_count == 0`.
