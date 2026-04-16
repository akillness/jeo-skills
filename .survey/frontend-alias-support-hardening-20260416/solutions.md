# Solution Landscape: Frontend alias support hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep aliases as-is | Leave thin alias `SKILL.md` files without support packets | Lowest immediate edit cost | Preserves compact drift and weak self-documentation | Rejected because the repo has already invested in support hardening as the default modernization path |
| Delete aliases outright | Remove `frontend-design-system` and `vercel-react-best-practices` | Eliminates duplicate folders | Breaks exact-name compatibility for older prompts/setup flows | Contradicts the repo’s canonical-vs-alias policy and the npm-style deprecate-not-delete pattern |
| Re-promote aliases to peer skills | Treat aliases as separate frontend specialties again | Might reduce rename friction for older users | Reintroduces trigger ambiguity and duplicate maintenance | Rejected by earlier canonicalization work |
| Harden aliases in place | Keep aliases narrow, add small `references/` packets, add route-out eval coverage, and refresh compact discovery text | Preserves compatibility while making routing explicit across all surfaces | Requires small but multi-file maintenance pass | Best bounded fit for the remaining frontend support gaps |

## Categories
- **Compatibility-preserving approaches**: keep aliases as-is, harden aliases in place
- **Structural simplification approaches**: delete aliases outright
- **Duplicate-reintroduction approaches**: re-promote aliases to peer skills

## What People Actually Use
In practice, compatibility layers survive when exact names matter, but maintainers steer users toward the canonical destination instead of letting the old surface remain equally attractive. npm’s deprecation workflow preserves the install surface while showing a redirect message. The repo itself already follows that strategy in `skills.json`, README, and README.ko for both frontend alias pairs. The remaining real-world gap is operational: compact/discovery text and folder-local support files still lag behind the canonical-vs-alias intent.

## Frequency Ranking
1. **Harden aliases in place** — matches current repo strategy and closes the last frontend support/documentation gap without new taxonomy churn.
2. **Keep aliases as-is** — cheapest short-term path, but it leaves known drift and repeat rediscovery costs.
3. **Delete aliases outright** — tempting structurally, but risky for compatibility and unnecessary right now.
4. **Re-promote aliases to peer skills** — lowest-value option because it reverses already-accepted consolidation work.

## Key Gaps
- `frontend-design-system` has evals and a narrow `SKILL.md`, but no `references/` packet to explain alias intent, canonical handoff, and compact-surface sync.
- `vercel-react-best-practices` similarly lacks alias-side `references/`, even after the canonical React skill was hardened with focused packets.
- `skills.toon` still misrepresents both aliases as substantive frontend skills, which is a derived-artifact drift problem the repo now tries to prevent systematically.

## Contradictions
- **Marketed/repo truth**: README, README.ko, and `skills.json` say both entries are compatibility aliases.
- **Operational reality**: `skills.toon` still markets both like normal frontend skill entries, so compact discovery can over-trigger the aliases.
- **Canonical reality**: the actual React and design-system guidance lives in `react-best-practices` and `design-system`, not the alias folders.

## Key Insight
The next win is not another frontend skill, and it is not another structural rename. It is finishing the canonical-vs-alias job at the support layer: add tiny alias-side reference packets, strengthen route-out eval coverage where useful, and make compact discovery text match the manifest truth. That preserves exact-name compatibility while reducing the chance that future maintenance or activation logic treats the aliases as peer defaults again.
