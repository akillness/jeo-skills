# Hourly Recency Window and Stage Expansion

Use this reference for unattended hourly survey runs that must stay recency-first while preserving deterministic recovery.

## Goal
- Start each mandatory lane with a narrow recency-first search window.
- Expand only through explicit stage-1 and stage-2 recovery queries.
- Preserve reviewability by recording both stage attempts for every lane.

## Required lane order
1. `agentic ai skill`
2. `web frontend skill`
3. `web backend skill`
4. `cli open source skill`
5. `game development skill`

## Query policy
- Stage-1: recency-first baseline (24h~7d focus).
- Stage-2: widened rescue query (stars/longer pushed window) when stage-1 is sparse/noisy.
- Always persist both stage entries (`stage-1`, `stage-2`) in `recovery_queries` even if stage-1 already has results.

## Objective recovery triggers
Run stage-2 when any trigger is true:
- `raw_count < 8`
- `kept_count == 0`
- `zero_star_raw / raw_count >= 0.70`

## Integrity checks
- Recompute metrics from the final selected result set:
  - `raw_count`
  - `kept_count`
  - `zero_star_raw`
  - `median_stars_raw`
- Never allow impossible states (`kept_count > raw_count`).
- If `raw_count == 0` after stage-2, mark:
  - `lane_status: degraded`
  - `degraded_causes: ["no-results"]`

## Provenance label mapping
- Search/listing evidence: `indexed snippet`
- Repo/API detail hydration: `direct page retrieval`

## Minimal reviewer report snippet
Include one compact table or bullets per lane:
- lane key
- stage selected
- raw_count / kept_count
- lane_status
- degraded_causes
