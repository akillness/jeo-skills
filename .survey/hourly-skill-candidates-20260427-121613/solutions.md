# Solution Landscape: oh-my-skills hourly survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | agentic-ai-skill | stars=14, license=Apache-2.0 | metadata-gated keep | direct page retrieval + indexed snippet |
| iwe-org/skills | agentic-ai-skill | stars=7, license=MIT | metadata-gated keep | direct page retrieval + indexed snippet |
| VoDaiLocz/Enhance-Prompt | agentic-ai-skill | stars=10, license=MIT | metadata-gated keep | direct page retrieval + indexed snippet |
| guarinogabriel/Mac-CLI | cli-open-source-skill | stars=9063, license=MIT | metadata-gated keep | direct page retrieval + indexed snippet |
| UnrealBlueprint/02_CrystalCavern | game-development-skill | stars=9, license=MIT | metadata-gated keep | direct page retrieval + indexed snippet |
| Unengine/GameEngineAndGameMathTIL | game-development-skill | stars=4, license=WTFPL | metadata-gated keep | direct page retrieval + indexed snippet |
| SMDS-Studio/Building-a-New-creative-Pong- | game-development-skill | stars=14, license=MIT | metadata-gated keep | direct page retrieval + indexed snippet |
| tjboudreaux/cc-plugin-unity-gamedev | game-development-skill | stars=3, license=MIT | metadata-gated keep | direct page retrieval + indexed snippet |

## Categories
- Deterministic recovery queries by lane.
- Metadata gating (license, pushed_at, archived).
- Signal floor and lane-intent overlap filtering.

## What People Actually Use
Maintainers use GitHub-native discovery (`gh search repos`) plus direct page retrieval (`gh api repos/<owner>/<repo>`) to recover missing license metadata and keep recommendation quality stable.

## Frequency Ranking
1. game-development-skill: 4 kept
2. agentic-ai-skill: 3 kept
3. cli-open-source-skill: 1 kept
4. web-frontend-skill: 0 kept
5. web-backend-skill: 0 kept

## Key Gaps
- web-frontend-skill: degraded causes = license, low-signal (indexed snippet)
- web-backend-skill: degraded causes = no-results (indexed snippet)

## Contradictions
- web-frontend-skill: raw discovery exists but recommendation-grade keep is zero, requiring recovery/gate tuning. (indexed snippet)

## Key Insight
Recommendation quality improves when primary sweep evidence is preserved for recall, but promotion is limited to candidates passing lane-intent overlap + signal floor + metadata gates. Provenance labels used: indexed snippet, direct page retrieval.
