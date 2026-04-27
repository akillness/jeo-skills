# Hourly survey open-PR backlog gate ratchet (2026-04-27)

## Summary
- Current hourly survey evidence shows **29 open PRs**, indicating merge-queue saturation.
- Selected low-risk change: codify an explicit backlog gate in survey hourly guidance so runs perform merge carry-forward before creating new PRs when backlog exceeds a threshold.

## Why this matters
- Existing lane-quality gates control search quality but do not directly control PR queue growth.
- Backlog-aware gating improves merge completion probability and reduces reviewer noise.

## Evidence
- Survey slug: `.survey/hourly-skill-candidates-20260427-221215`
- RTK summary: `.survey/hourly-skill-candidates-20260427-221215/rtk-summary.md`
- Graphify refined artifact: `.survey/hourly-skill-candidates-20260427-221215/graphify-refined.json`
- Open PR sample captured in `.survey/hourly-skill-candidates-20260427-221215/evidence.json`

## Proposed ratchet
- In `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`, add a deterministic pre-PR backlog gate:
  - measure with `gh pr list --state open`
  - if open hourly PR backlog is above threshold, switch to carry-forward merge path first
  - still produce survey artifacts to keep evidence continuity

## Links
- Related note: `queries/2026-04-27-hourly-survey-merge-carry-forward.md`
- Related note: `queries/2026-04-27-hourly-survey-gh-search-empty-payload-ratchet.md`
