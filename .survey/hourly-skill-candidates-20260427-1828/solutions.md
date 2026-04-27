# Solution Landscape: gh-search empty payload fallback ratchet

## Solution List
| Rank | Name | Stars | License | Lane | Evidence |
|------|------|-------|---------|------|----------|
| 1 | encoredev/encore | 11871 | MPL-2.0 | web-backend-skill | https://github.com/encoredev/encore |
| 2 | guarinogabriel/Mac-CLI | 9064 | MIT | cli-open-source-skill | https://github.com/guarinogabriel/Mac-CLI |
| 3 | larksuite/cli | 8859 | MIT | agentic-ai-skill | https://github.com/larksuite/cli |
| 4 | EpicGamesExt/BlenderTools | 3135 | MIT | game-development-skill | https://github.com/EpicGamesExt/BlenderTools |
| 5 | go-goyave/goyave | 1770 | MIT | web-backend-skill | https://github.com/go-goyave/goyave |
| 6 | dembrandt/dembrandt | 1719 | MIT | web-frontend-skill | https://github.com/dembrandt/dembrandt |

## Categories
- Search transport resilience
- GitHub retrieval compatibility
- Repo-maintenance survey quality gating

## What People Actually Use
Maintainers fall back to direct GitHub REST search (`gh api "search/repositories?..."`) when search transport or CLI behavior is degraded. They keep lane-level degraded causes explicit rather than pretending ecosystem absence.

## Frequency Ranking
1. `gh api search/repositories` fallback after empty `gh search repos`
2. Stage-2 lane broadening queries with explicit thresholds
3. Relevance + freshness + license gates before recommendation-grade promotion

## Key Gaps
- Existing survey guidance covers schema drift and transport failure, but not the **empty-success** case (`[]` with exit 0) from `gh search repos`.
- Guidance does not explicitly document the endpoint form that works reliably in this environment (`gh api "search/repositories?..."`) versus failing form (`gh api /search/repositories -f ...`, 404).

## Contradictions
- Strict empty-payload fallback adds one extra API call path, but significantly reduces false-negative lane degradation.

## Key Insight
Low-risk merge candidate: add an explicit **`gh search repos` empty payload guard** and deterministic `gh api "search/repositories?..."` fallback step to survey guidance/references.

## Curated Sources
- https://cli.github.com/manual/gh_search_repos (direct page retrieval)
- https://docs.github.com/en/rest/search/search#search-repositories (direct page retrieval)
- https://github.com/akillness/oh-my-skills/tree/main/.agent-skills/survey (direct page retrieval)
