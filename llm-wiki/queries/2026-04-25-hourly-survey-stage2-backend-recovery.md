# 2026-04-25 Hourly Survey: stage-2 backend recovery candidate

## Context
- Run slug: `hourly-skill-candidates-20260425-075308`
- Evidence: `.survey/hourly-skill-candidates-20260425-075308/evidence.json`
- RTK summary: `.survey/hourly-skill-candidates-20260425-075308/rtk-summary.md`
- Graphify artifact: `.survey/hourly-skill-candidates-20260425-075308/graphify-refined.json`

## Observation
- `backend` lane remained `degraded` with `raw_count=0` and `kept_count=0` after current primary+recovery template.
- This indicates a recurring query-template sparsity issue rather than one-off retrieval noise.

## Proposed low-risk ratchet
- Add a documented stage-2 backend recovery query template (still GitHub-native, still recommendation-grade gate).
- Keep deterministic trigger and provenance labeling (`direct page retrieval`) unchanged.

## Provenance
- direct page retrieval
