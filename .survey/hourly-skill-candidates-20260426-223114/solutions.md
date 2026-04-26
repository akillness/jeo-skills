# Solution Landscape: hourly skill candidate survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| andreasbm/web-skills | Search-based discovery + metadata gate | Active project, has stars/license | Not all are directly skill-framework repos | lane=web_backend; stars=7521; provenance=indexed snippet |
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | Search-based discovery + metadata gate | Active project, has stars/license | Not all are directly skill-framework repos | lane=agentic_ai; stars=14; provenance=indexed snippet |
| VoDaiLocz/Enhance-Prompt | Search-based discovery + metadata gate | Active project, has stars/license | Not all are directly skill-framework repos | lane=agentic_ai; stars=10; provenance=indexed snippet |
| iwe-org/skills | Search-based discovery + metadata gate | Active project, has stars/license | Not all are directly skill-framework repos | lane=agentic_ai; stars=7; provenance=indexed snippet |
| tjboudreaux/cc-plugin-unity-gamedev | Search-based discovery + metadata gate | Active project, has stars/license | Not all are directly skill-framework repos | lane=game_development; stars=3; provenance=indexed snippet |

## Categories
- Search-first candidate discovery
- Metadata and relevance gating
- Provenance-enforced artifact generation

## What People Actually Use
Maintainers tend to use GitHub search/API indexed snippets as primary survey evidence in unattended runs. (provenance: indexed snippet)

## Frequency Ranking
1. agentic_ai (kept=3, raw=30)
2. web_backend (kept=1, raw=1)
3. game_development (kept=1, raw=30)
4. web_frontend (kept=0, raw=4)
5. cli_open_source (kept=0, raw=0)

## Key Gaps
- web_frontend: degraded due to license, low-signal, stale (provenance: indexed snippet)
- cli_open_source: degraded due to no-results (provenance: indexed snippet)

## Contradictions
- agentic_ai: filtered 3 low-fit/low-signal examples; e.g., Ap6pack/malwar (low-signal). (provenance: indexed snippet)
- web_frontend: filtered 3 low-fit/low-signal examples; e.g., amrrs/cinematic-webscroll-frontend-skill (license). (provenance: indexed snippet)
- game_development: filtered 3 low-fit/low-signal examples; e.g., UnrealBlueprint/02_CrystalCavern (stale). (provenance: indexed snippet)

## Key Insight
Recommendation quality improves when lane-intent overlap + signal floor + metadata gates are applied before any skill-file edits. (provenance: indexed snippet)
