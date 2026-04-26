---
name: github-repo-candidate-quality-gate
description: >
  Convert noisy GitHub repository search results into recommendation-grade candidate
  lists with explicit metadata, freshness, traction signal, provenance labels, and
  rollback-safe reporting for maintenance PR workflows.
allowed-tools: Bash Read Write Grep Glob
license: MIT
metadata:
  tags: github, search, triage, quality-gate, repo-maintenance
  version: "1.0.0"
  source: akillness/oh-my-skills
---

# GitHub Repo Candidate Quality Gate

Use this skill when broad GitHub search output is too noisy for merge-ready recommendations.

## When to use
- You already ran `gh search repos` (or equivalent) and need recommendation-grade keeps.
- You must preserve broad discovery evidence while filtering keeps deterministically.
- You need lane-level status + degraded-cause reporting for unattended cron review.

## Minimum keep metadata
For every kept candidate, capture all fields:
- `full_name`
- `url`
- `license`
- `pushed_at` (or `updated_at` fallback)
- `archived`
- `stars`
- one-line fit rationale
- provenance label

## Quality gate order
1. **License gate**: drop missing/unknown license unless explicit exception rationale.
2. **Archive gate**: drop archived repos by default.
3. **Freshness gate**: drop if `pushed_at` older than 24 months unless exception + risk.
4. **Fit gate**: drop keyword-only mismatches (low-fit).
5. **Signal gate**: keep broad discovery evidence, but recommendation-grade keeps require traction (default: `stars >= 3`) or explicit adoption rationale.

## Reporting contract
- Keep and publish full discovery counts even when keeps are sparse.
- Emit `lane_status: pass|degraded`.
- Emit `degraded_causes` counts using: `license`, `stale`, `low-fit`, `archived`, `low-signal`, `no-results`.
- When a lane ends with `raw_count == 0` after documented recovery, include `no-results` explicitly to keep degraded reports deterministic.
- Include lane health metrics: `kept_count`, `raw_count`, `median_stars_raw`, `zero_star_raw`.
- State provenance labels used (`direct page retrieval`, `indexed snippet`, etc.).

## Rollback-safe operation
- Never delete raw evidence files.
- If stricter gates reduce keep counts too far, preserve output but mark lane degraded.
- Allow exception keeps only when rationale + risk note are explicit.

## Example
- Input: 30 raw hits, many zero-star repos.
- Output: discovery evidence retained, recommendation keeps filtered by metadata/freshness/signal gates, degraded causes documented for reviewer.
