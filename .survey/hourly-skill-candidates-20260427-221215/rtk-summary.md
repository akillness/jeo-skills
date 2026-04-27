# RTK Summary

- Generated with `rtk json --keys-only` and `rtk summary` over `.survey/hourly-skill-candidates-20260427-221215/evidence.json`.
- Open PR backlog is high: **29** open PRs.
- Keyword sweep lane health (RTK condensed):
  - `agentic ai skill`: pass (kept 4 / raw 20)
  - `web frontend skill`: degraded (kept 0 / raw 20)
  - `web backend skill`: pass (kept 1 / raw 20)
  - `cli open source skill`: pass (kept 1 / raw 20)
  - `game development skill`: degraded (kept 0 / raw 20)
- Aggregate low-signal pressure remains high: `aggregate_zero_star_ratio = 0.64`.

## Candidate Decision
Adopt a low-risk process ratchet: add an **open-PR backlog gate** so hourly runs prioritize merge carry-forward before creating a new PR when backlog exceeds threshold.