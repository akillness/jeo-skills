# Solution Landscape: hourly-skill-candidates

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | Add curated docs entry for external skill | Fresh, licensed, non-archived candidate | Niche domain specificity | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (direct page retrieval) |
| survey keyword rescue ratchet | Tighten stage rules for no-result lanes | Improves deterministic hourly comparability | Requires careful wording updates | .agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md (direct page retrieval) |

## Categories
- **Existing skill improvement:** survey rescue/query-transcript hardening for no-result lanes.
- **New skill addition (doc-level curation):** add curated external skill documentation based on kept candidate evidence.

## What People Actually Use
- GitHub-native search + repo metadata (`gh search`, `gh api`) to gate by license/freshness/signal (direct page retrieval).
- Recommendation-grade keep lists with explicit degraded causes when lanes fail thresholds.

## Frequency Ranking
1. agentic ai skill: 2 kept
2. game development skill: 1 kept
3. web frontend skill: 0 kept
4. web backend skill: 0 kept
5. cli open source skill: 0 kept

## Key Gaps
- web frontend skill: degraded (license, low-signal, stale)
- web backend skill: degraded (no-results)
- cli open source skill: degraded (no-results)

## Contradictions
- Broad keyword lanes claim ecosystem coverage, but `raw_count==0` in backend/cli shows query-shape sensitivity.
- High recall from noisy lanes can still yield low recommendation quality without strict license/signal gates.

## Key Insight
Sparse lanes are not proof of ecosystem absence; they usually indicate query-shape mismatch. The safest hourly ratchet is to codify deterministic stage-1/stage-2 rescue behavior and preserve explicit `no-results` causes while still shipping one low-risk curated candidate per run.
