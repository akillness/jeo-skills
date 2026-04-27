# Solution Landscape: hourly skill candidate sweep

## Solution List
| Rank | Name | Stars | License | Lane | Evidence |
|------|------|-------|---------|------|----------|
| 1 | bug-ops/zeph | 30 | MIT | agentic-ai-skill | https://github.com/bug-ops/zeph |
| 2 | agentskillexchange/skills | 6 | MIT | agentic-ai-skill | https://github.com/agentskillexchange/skills |
| 3 | Gaku52/software-engineering-universe | 5 | MIT | web-backend-skill | https://github.com/Gaku52/software-engineering-universe |

## Categories
- Agentic AI tooling
- Web frontend/backend implementation skills
- CLI/open-source workflow skills
- Game-development tooling

## What People Actually Use
Maintainers discover candidates via GitHub search surfaces, then rely on metadata gates (license/freshness/archive/signal) before converting discoveries into skill updates.

## Frequency Ranking
1. GitHub repository search + metadata filtering
2. Deterministic fallback to `gh api search/repositories`
3. Lane-status reporting with degraded causes

## Key Gaps
- Candidate quality drifts when retrieval transport is unstable or metadata is incomplete.
- Documentation must keep explicit fallback behavior and provenance labels synchronized with real hourly failure modes.

## Contradictions
- Broad discovery favors recall; recommendation-grade gates favor precision and may reduce lane coverage.

## Key Insight
Low-risk improvement remains governance hardening: keep fallback handling explicit, auditable, and validator-aligned across hourly survey runs.

## Curated Sources
- https://cli.github.com/manual/gh_search_repos (direct page retrieval)
- https://docs.github.com/en/rest/search/search#search-repositories (direct page retrieval)
- https://github.com/akillness/oh-my-skills/tree/main/.agent-skills/survey (direct page retrieval)
