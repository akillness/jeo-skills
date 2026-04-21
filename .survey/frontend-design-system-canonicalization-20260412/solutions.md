# Solution Landscape: frontend design-system canonicalization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Canonical skill + compatibility alias | Keep one default skill and narrow the duplicate into a redirect layer | Preserves backward compatibility while reducing trigger noise | Requires docs/setup/manifest updates in the same pass | Best fit for this repo's current state |
| Hard deletion | Remove the duplicate entirely | Simplest long-term catalog | Risks breaking exact-name workflows and setup expectations | Too abrupt for this run |
| Leave both as peers | Keep current pair unchanged | No migration work | Continues duplicate routing and maintenance overhead | Current baseline, not good enough |
| Deep scope split | Rewrite each skill to own truly separate jobs | Could justify two skills if the split were real | Current content does not support a real split | Would be a broader redesign, not a bounded ratchet |

## Categories
- **Metadata quality:** stronger descriptions, trigger boundaries, explicit canonical-vs-alias status
- **Compatibility handling:** legacy/exact-name alias instead of peer default
- **Discoverability:** README/setup/manifest text should match the real routing rule
- **Validation:** evals should prove the canonical skill wins ordinary prompts and the alias only activates for exact-name or migration scenarios

## What People Actually Use
Right now operators likely use `design-system` as the default because `frontend-design-system` already says to prefer it, but the repo still exposes both names equally on major inventory surfaces. In practice this means the human or agent has to manually resolve the ambiguity.

## Frequency Ranking
1. Canonical identifier separate from display label / compatibility alias
2. High-quality descriptions with explicit routing boundaries
3. Trigger examples or eval prompts that reveal overlap early
4. Tags and aliases for discoverability instead of duplicate peer entries

## Key Gaps
- The design-system pair still lacks a repo-level canonical/alias expression.
- There are no evals proving the default-vs-alias boundary.
- Public inventory surfaces still present both skills as equally preferred.

## Contradictions
- `frontend-design-system` claims to be a platform-specific variant, but README/setup/manifest still present it as a normal all-platform frontend skill.
- The repo's standardization guidance stresses trigger precision, while this pair still uses near-identical descriptions.

## Key Insight
This is not a missing-skill problem. It is a catalog hygiene problem. The highest-leverage move is to keep `design-system` as the canonical UI-system skill, convert `frontend-design-system` into a thin compatibility alias, and teach the repo's standardization guidance to prefer canonical-plus-alias handling when two skills compete at the metadata layer.
