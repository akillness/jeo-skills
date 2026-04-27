# Solution Landscape: oh-my-skills hourly survey maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| github/awesome-copilot | lane-intent overlap + metadata gates | stars=31332 and recent activity | context may still be shallow | https://github.com/github/awesome-copilot (direct page retrieval) |
| coreyhaines31/marketingskills | lane-intent overlap + metadata gates | stars=25056 and recent activity | context may still be shallow | https://github.com/coreyhaines31/marketingskills (direct page retrieval) |
| zarazhangrui/frontend-slides | lane-intent overlap + metadata gates | stars=15793 and recent activity | context may still be shallow | https://github.com/zarazhangrui/frontend-slides (direct page retrieval) |
| ceilf6/FrontAgent | lane-intent overlap + metadata gates | stars=92 and recent activity | context may still be shallow | https://github.com/ceilf6/FrontAgent (direct page retrieval) |
| mukeshlilawat1/Hotel-Mountain-Mirage | lane-intent overlap + metadata gates | stars=17 and recent activity | context may still be shallow | https://github.com/mukeshlilawat1/Hotel-Mountain-Mirage (direct page retrieval) |
| jeremylongshore/claude-code-plugins-plus-skills | lane-intent overlap + metadata gates | stars=2040 and recent activity | context may still be shallow | https://github.com/jeremylongshore/claude-code-plugins-plus-skills (direct page retrieval) |
| dp-archive/archive | lane-intent overlap + metadata gates | stars=1108 and recent activity | context may still be shallow | https://github.com/dp-archive/archive (direct page retrieval) |
| tjboudreaux/cc-plugin-unity-gamedev | lane-intent overlap + metadata gates | stars=3 and recent activity | context may still be shallow | https://github.com/tjboudreaux/cc-plugin-unity-gamedev (direct page retrieval) |

## Categories
- Candidate discovery and evidence capture
- Recommendation promotion gates
- Headless fallback and resilience

## What People Actually Use
Maintainers use GitHub-native retrieval and only promote candidates that satisfy objective checks (license, freshness, lane fit, signal floor). This keeps hourly PRs stable (direct page retrieval).

## Frequency Ranking
1. agentic-ai-skill (kept=26, raw=60)
2. cli-open-source-skill (kept=11, raw=18)
3. web-frontend-skill (kept=7, raw=33)
4. web-backend-skill (kept=1, raw=17)
5. game-development-skill (kept=1, raw=30)

## Key Gaps
- Degraded lanes still appear in frontend/backend/game sweeps.
- Metadata enrichment adds API overhead.
- Concentration risk remains possible when only a subset of lanes pass.

## Contradictions
- No major contradiction observed in this run (direct page retrieval)

## Key Insight
Keep broad recall in evidence but gate recommendations strictly; this balances discovery coverage with merge-safe quality.
