# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic ai skill | Mandatory lane + recovery + gating | Deterministic coverage | Can degrade on low-fit/no-results | status=pass, kept=5, raw=30 |
| web frontend skill | Mandatory lane + recovery + gating | Deterministic coverage | Can degrade on low-fit/no-results | status=degraded, kept=0, raw=5 |
| web backend skill | Mandatory lane + recovery + gating | Deterministic coverage | Can degrade on low-fit/no-results | status=degraded, kept=0, raw=1 |
| cli open source skill | Mandatory lane + recovery + gating | Deterministic coverage | Can degrade on low-fit/no-results | status=pass, kept=1, raw=1 |
| game development skill | Mandatory lane + recovery + gating | Deterministic coverage | Can degrade on low-fit/no-results | status=pass, kept=1, raw=30 |

## Categories
- Discovery lanes
- Quality gating
- Artifact validation

## What People Actually Use
- agentic ai skill: AbdelhakRazi/flutter-bloc-clean-architecture-skill (provenance: indexed snippet)
- web frontend skill: No promoted repo (provenance: indexed snippet)
- web backend skill: No promoted repo (provenance: indexed snippet)
- cli open source skill: nexu-io/open-design (provenance: indexed snippet)
- game development skill: tjboudreaux/cc-plugin-unity-gamedev (provenance: indexed snippet)

## Frequency Ranking
1. agentic ai skill (kept=5)
2. cli open source skill (kept=1)
3. game development skill (kept=1)
4. web frontend skill (kept=0)
5. web backend skill (kept=0)

## Key Gaps
- web frontend skill: degraded due to low-fit
- web backend skill: degraded due to low-fit

## Contradictions
- Broad recall can find many repos, but recommendation gate may keep few due to low-fit/license/stale checks.

## Key Insight
Lane-complete raw discovery plus strict promotion gates preserves auditability while preventing low-fit recommendations. Provenance: indexed snippet.
