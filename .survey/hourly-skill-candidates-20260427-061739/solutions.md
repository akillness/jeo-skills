# Solution Landscape: hourly skill-candidate reliability

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub-native retrieval fallback | Use `gh search repos` + `gh api` when web_search fails | Deterministic in cron, rich metadata | Keyword noise still needs relevance gate | provenance: direct page retrieval |
| Lane metrics + degraded taxonomy | Emit pass/degraded with explicit causes | Reviewer-friendly drift tracking | Requires consistent markdown contract | provenance: direct page retrieval |
| Transport-failure artifact logging | Save concrete error reason and fallback path | Makes outages auditable | Extra artifact maintenance | provenance: direct page retrieval |

## Categories
- Retrieval transport resilience
- Recommendation quality gating
- Cron observability and auditability

## What People Actually Use
This run used GitHub-native CLI retrieval as primary fallback after web_search failed with 401. Candidate discovery still completed across all five required keyword families with lane metrics retained. `web backend skill` lane was `degraded` due to low raw_count, not missing transport.

## Frequency Ranking
1. GitHub-native retrieval fallback (used in nearly every degraded-search run)
2. Lane status + degraded causes taxonomy
3. Transport-error artifact logging

## Key Gaps
- Transport degradation cause is not explicitly represented in the compact degraded-cause taxonomy list in `keyword-sweep-and-relevance-rescue.md`.
- The survey skill does not currently require a dedicated `transport_status` note in loop artifacts when search falls back.

## Contradictions
- Broad keyword sweeps improve recall, but also increase low-fit noise; strict gate and lane metrics are required to keep recommendations trustworthy.

## Key Insight
Low-risk high-value change: codify `transport` as an explicit degraded-cause taxonomy and require transport-status recording in repo-maintenance hourly surveys. This improves reviewer trust without changing core candidate logic.

## Curated Sources
- https://github.com/addyosmani/agent-skills (indexed snippet)
- https://github.com/Orchestra-Research/AI-Research-SKILLs (indexed snippet)
- https://github.com/jeremylongshore/claude-code-plugins-plus-skills (indexed snippet)
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/SKILL.md (direct page retrieval)
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md (direct page retrieval)
