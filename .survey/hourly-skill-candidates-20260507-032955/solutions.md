# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | GitHub search + metadata gate | High-signal candidate exists (AbdelhakRazi/flutter-bloc-clean-architecture-skill) | Still sensitive to query noise | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (provenance: indexed snippet) |
| web-frontend-skill | GitHub search + recovery | Deterministic degraded reporting | No recommendation-grade keeps | lane degraded causes: license, low-signal, stale |
| web-backend-skill | GitHub search + recovery | Deterministic degraded reporting | No recommendation-grade keeps | lane degraded causes: license |
| cli-open-source-skill | GitHub search + metadata gate | High-signal candidate exists (nexu-io/open-design) | Still sensitive to query noise | https://github.com/nexu-io/open-design (provenance: indexed snippet) |
| game-development-skill | GitHub search + metadata gate | High-signal candidate exists (tjboudreaux/cc-plugin-unity-gamedev) | Still sensitive to query noise | https://github.com/tjboudreaux/cc-plugin-unity-gamedev (provenance: indexed snippet) |

## Categories
- Discovery lanes: agentic/web frontend/web backend/cli/game dev.
- Governance lanes: quality gates, provenance, merge block handling.

## What People Actually Use
GitHub indexed repo search with explicit metadata gate is the primary mechanism. (provenance: indexed snippet)

## Frequency Ranking
1. web backend skill
2. agentic ai skill
3. cli open source skill
4. web frontend skill
5. game development skill

## Key Gaps
- Some lanes still produce low-fit repos despite token overlap gating.
- CI checks absent on open PR branches block safe merge execution.

## Contradictions
- Requirement says implement every run, but merge must stop when checks are absent.

## Key Insight
Recommendation coverage is broad enough when at least two lanes keep candidates; otherwise concentration risk should be flagged.
