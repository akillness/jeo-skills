# Solution Landscape: oh-my-skills hourly candidate sweep

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| iwe-org/skills | Lane candidate from `agentic ai skill` | stars=7, license=MIT License, pushed_at=2026-04-06T01:48:47Z | Potential domain-transfer risk; requires maintainer judgment | https://github.com/iwe-org/skills |
| codewith-salman/Rescuer-Game | Lane candidate from `game development skill` | stars=3, license=Apache License 2.0, pushed_at=2026-02-19T18:36:14Z | Potential domain-transfer risk; requires maintainer judgment | https://github.com/codewith-salman/Rescuer-Game |
| tjboudreaux/cc-plugin-unity-gamedev | Lane candidate from `game development skill` | stars=3, license=MIT License, pushed_at=2026-02-06T04:09:12Z | Potential domain-transfer risk; requires maintainer judgment | https://github.com/tjboudreaux/cc-plugin-unity-gamedev |
| Shubham-Jana-Dev/bengal-skies-js-game | Lane candidate from `game development skill` | stars=5, license=MIT License, pushed_at=2025-12-16T16:34:50Z | Potential domain-transfer risk; requires maintainer judgment | https://github.com/Shubham-Jana-Dev/bengal-skies-js-game |

## Categories
- Recommendation-grade keeps: pass relevance + metadata + freshness + signal gates.
- Discovery-only records: low-fit / stale / low-signal / archived / license-risk.

## What People Actually Use
- The strongest recommendation-grade keeps in this run came from `agentic ai skill` and `game development skill` lanes.
- Sparse lanes (`web frontend`, `web backend`, `cli open source`) remained degraded after primary sweep.

## Frequency Ranking
1. Game-development lane produced the highest keep count (3).
2. Agentic-ai lane produced one keep with acceptable metadata/traction.
3. Frontend/backend/cli lanes produced zero keeps (degraded).

## Key Gaps
- `cli open source skill` lane produced `raw_count: 0` and should always report `no-results` explicitly.
- Sparse frontend/backend lanes limit cross-lane recommendation diversity.

## Contradictions
- Broad keyword recall is useful for evidence collection but frequently fails recommendation-grade filters.
- High raw counts do not imply high-quality keeps due to low-fit and low-signal saturation.

## Key Insight
Deterministic degraded-cause reporting (including `no-results`) is required to keep hourly PR reviews unambiguous and merge-safe.

### Filtered Low-Fit Examples
- No low-fit examples captured.

Provenance labels used in this file: indexed snippet, direct page retrieval.
