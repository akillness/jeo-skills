# Solution Landscape: marketing-skills-collection support hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep current thin alias unchanged | Leave the alias as-is and rely on canonical docs | Lowest effort; current behavior already works | Leaves alias as a `references/` holdout and does not fix compact discovery drift | Too small for the current maintenance bar |
| Canonical router + thin compatibility alias | Keep `marketing-automation` canonical and `marketing-skills-collection` migration-safe | Matches accepted repo pattern; avoids duplicate peer skills; preserves legacy workflows | Still needs support/discovery sync to stay safe | Best-fit architecture |
| Canonical router + alias-specific support packet | Add small alias references that explain when to map, how to preserve old names, and when to route out | Improves day-to-day usability without reintroducing a second peer skill | Must stay lightweight or it becomes duplicate documentation | Best bounded upgrade for this run |
| Canonical router + mode-locked alias | Alias resolves to canonical skill and also enforces a mode | Works for stack-specific aliases like Remotion | Weak fit for marketing because the alias is naming-based, not stack-based | Reject for marketing |
| Re-promote both marketing skills as peers | Treat `marketing-automation` and `marketing-skills-collection` as independent broad skills | None beyond nostalgia | Recreates duplicate triggers, drift, and review noise | Explicitly rejected by prior repo decisions |

## Categories
### Architecture
- Canonical router + thin alias
- Canonical router + alias support packet
- Canonical router + mode lock

### Support / discovery
- Alias evals only
- Alias references + compact sync
- Full docs/manifest/compact surface sync

### Rejected patterns
- Peer broad marketing skills
- Third overlapping wrapper
- Hard-deleting the alias before legacy surfaces finish migrating

## What People Actually Use
Repo-local evidence shows that the actual behavior is already `marketing-automation` for broad marketing asks, while `marketing-skills-collection` is mainly used as a legacy-name passthrough. Operators expect the system to choose exactly one lane, produce one packet, and route out specialist or game-specific launch work instead of exploding broad asks into channel soup.

## Frequency Ranking
1. **Canonical skill + thin compatibility alias** — dominant repo-local pattern across marketing, frontend, creative-media, and React alias lanes.
2. **Immediate canonical resolution + same output packet** — used where the alias should behave almost exactly like the canonical skill.
3. **Alias-side support bundle** — currently absent across the remaining holdout aliases, which is why this run is valuable.
4. **Mode-locked alias** — rare and not justified for marketing.

## Key Gaps
- `marketing-skills-collection` still lacks a focused `references/` packet.
- The compact discovery layer still describes both marketing entries with the old 23-sub-skill framing, which weakens the canonical-vs-alias boundary.
- The repo has good eval coverage for the alias but still weak support symmetry between the canonical skill and the alias.

## Contradictions
- **Marketed / historical model:** the old marketing pair looked like broad deliverable generators with many sub-skills.
- **Current accepted model:** the repo now wants one KPI-aware router plus a thin compatibility alias.
- **Remaining contradiction in artifacts:** compact discovery files still sound like the old peer-skill model even though `SKILL.md` and the wiki say otherwise.

## Key Insight
The right move is not another marketing skill and not a major rewrite of the canonical router. The durable win is to finish the alias migration properly: keep `marketing-automation` as the single broad entrypoint, harden `marketing-skills-collection` with a tiny support packet that teaches safe canonical resolution, and refresh compact discovery artifacts so the runtime surface stops advertising the old 23-sub-skill worldview.

## Curated Sources
- `.agent-skills/marketing-automation/SKILL.md`
- `.agent-skills/marketing-skills-collection/SKILL.md`
- `.agent-skills/marketing-automation/references/routing-heuristics.md`
- `.agent-skills/marketing-automation/references/measurement-handoff.md`
- `.agent-skills-wiki/queries/marketing-skill-canonicalization-2026-04-12.md`
- `.agent-skills-wiki/queries/skill-standardization-variant-sync-2026-04-15.md`
- `.agent-skills-wiki/concepts/frontend-skill-canonicalization.md`
- `graphify-out/GRAPH_REPORT.md`
- `https://docs.npmjs.com/cli/v11/using-npm/package-spec#aliases`
- `https://nextjs.org/docs/pages/building-your-application/routing/redirecting`
