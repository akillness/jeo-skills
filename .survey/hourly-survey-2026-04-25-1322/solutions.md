# Solution Landscape: hourly-survey-2026-04-25-1322

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep current 4-cause taxonomy | No schema change | Backward compatible | Cannot represent tool transport/auth failures | Causes false attribution to low-fit in outage cases |
| Add `transport/auth` degraded cause | Minimal schema extension in survey docs/skill | Captures real outage class; keeps reports compact | Requires one docs+skill update | Best low-risk ratchet for this run |
| Add broad infra failure bucket | Generic `infra` cause | Simple | Too vague for actionability | Weaker than explicit auth/transport taxonomy |

## Categories
- Taxonomy hardening
- Reliability/operability observability
- Reporting consistency for cron loops

## What People Actually Use
- Primary keyword sweep via GitHub search syntax.
- Seeded recovery candidates for sparse/noisy lanes.
- GitHub API metadata (`license`, `pushed_at`, `archived`) for recommendation-grade keeps.

## Frequency Ranking
1. `gh search` + relevance gate + seed rescue
2. Lane metrics (`raw_count`, `kept_count`, `median_stars_raw`, `zero_star_raw`)
3. Manual degraded-cause annotation

## Key Gaps
- Missing first-class degraded cause for search transport/auth failures.
- Existing taxonomy (`license|stale|low-fit|archived`) mixes content-quality issues and infrastructure failures.

## Contradictions
- Lanes can pass via seed recovery while still having broken external web search; current taxonomy cannot encode both cleanly.

## Key Insight
The highest leverage, lowest-risk improvement is to add `transport/auth` to the lane degraded-cause taxonomy and checklist. This keeps hourly survey artifacts truthful under tool outages without changing artifact structure.

## Curated Sources
- https://github.com/langchain-ai/langgraph (direct page retrieval)
- https://github.com/microsoft/autogen (direct page retrieval)
- https://github.com/crewAIInc/crewAI (direct page retrieval)
- https://github.com/vercel/next.js (direct page retrieval)
- https://github.com/fastapi/fastapi (direct page retrieval)
- https://github.com/junegunn/fzf (direct page retrieval)
- https://github.com/godotengine/godot (direct page retrieval)
