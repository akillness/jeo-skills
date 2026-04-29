# Solution Landscape: hourly-skill-maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Lane query transcript ratchet (selected) | Add explicit per-lane primary/stage1/stage2 transcript requirement to survey rescue reference and mention in SKILL.md | Auditable degraded decisions; low-risk docs-only change | Slightly longer artifacts | Aligns with recurring zero-result lanes this run |
| Keep existing process unchanged | No file changes | Zero migration risk | Repeats ambiguity when lanes degrade | Not selected |
| Raise global star threshold | Tightens recommendation precision | May reduce noisy keeps | Risks false negatives in niche lanes | High-risk policy change |

## Categories
- selected: documentation/process ratchet
- fallback: no-change
- high-risk: threshold policy shift

## What People Actually Use
- Hourly loops rely on `gh search repos` discovery + `gh api repos/<owner>/<repo>` metadata fallback in unattended mode.
- Maintainers prioritize deterministic, reversible reference-doc changes over heavy script rewrites.

## Frequency Ranking
1. Deterministic quality-ratchet updates in survey references
2. Degraded-cause taxonomy refinements
3. Global threshold overhauls

## Key Gaps
- Stage retries can occur but remain under-documented per lane unless query transcript fields are explicit.
- New skill candidates appear in discovery, but documentation onboarding lags unless each run lands at least one concrete addition.

## Contradictions
- More strict filters improve precision but can make sparse lanes look empty.
- Broader discovery improves recall but increases low-fit noise.

## Key Insight
- Two lanes (`web-frontend-skill`, `web-backend-skill`) remained degraded after deterministic stage retries (0 raw), so explicit lane query transcript logging should be required to distinguish retrieval scarcity vs ecosystem scarcity.

## Curated Sources
- cli-open-source-skill | guarinogabriel/Mac-CLI | https://github.com/guarinogabriel/Mac-CLI | provenance: indexed snippet + direct page retrieval
- agentic-ai-skill | AbdelhakRazi/flutter-bloc-clean-architecture-skill | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill | provenance: indexed snippet + direct page retrieval
- game-development-skill | SMDS-Studio/Building-a-New-creative-Pong- | https://github.com/SMDS-Studio/Building-a-New-creative-Pong- | provenance: indexed snippet + direct page retrieval
- agentic-ai-skill | VoDaiLocz/Enhance-Prompt | https://github.com/VoDaiLocz/Enhance-Prompt | provenance: indexed snippet + direct page retrieval
- game-development-skill | UnrealBlueprint/02_CrystalCavern | https://github.com/UnrealBlueprint/02_CrystalCavern | provenance: indexed snippet + direct page retrieval
- agentic-ai-skill | iwe-org/skills | https://github.com/iwe-org/skills | provenance: indexed snippet + direct page retrieval
