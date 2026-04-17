# Solution Landscape: technical-writing structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep current `technical-writing` front door | Leave `SKILL.md` mostly as-is | No migration work; existing refs/evals already present | Dense 320-line entry, malformed route-out block, duplicated structure examples, slower activation scan | Weakest compounding option |
| Add another internal-docs wrapper | Create a second docs/planning skill | Could isolate one sub-mode | Creates duplicate trigger surface and catalog noise | Rejected by prior wiki boundary notes |
| Merge into `api-documentation` / `user-guide-writing` / `changelog-maintenance` | Collapse documentation lanes | Fewer names on paper | Destroys the repo’s internal-docs boundary; mixes audiences and jobs | Contradicts documentation-cluster guidance |
| Structural hardening in place | Shrink `technical-writing` into a routing-first front door and lean on existing support files | Preserves the correct boundary, reduces token load, improves trigger clarity, keeps support investment | Requires careful sync of `SKILL.md`, `SKILL.toon`, evals, and manifest wording | **Best bounded move this run** |

## Categories
- **Status quo**: keep the oversized front door unchanged.
- **Catalog expansion**: add another overlapping documentation skill.
- **Catalog collapse**: merge internal docs into neighboring doc skills.
- **Structural hardening**: preserve the existing skill but shorten the front door and sharpen route-outs.

## What People Actually Use
In this repo’s recent maintenance pattern, the successful moves are not adding more skills but shrinking oversized canonical skills into small routers backed by references and evals. `file-organization`, `api-documentation`, `deployment-automation`, `design-system`, and `authentication-setup` all improved by moving detail into support files while keeping explicit route-outs in the main skill.

## Frequency Ranking
1. Structural hardening of an existing canonical skill
2. Keep the current front door and tolerate drift
3. Add a new overlapping wrapper
4. Merge the lane into another documentation skill

## Key Gaps
- The current `technical-writing` front door still duplicates too much mode/template detail that already exists in references.
- The malformed route-out section makes neighboring-skill boundaries less reliable than they should be.
- Evals cover spec/ADR/runbook/user-doc routing, but not enough boundary pressure around API docs or release-history overlap.

## Contradictions
- Marketed reality from docs frameworks says doc modes should stay distinct, but the current skill still carries enough mixed structure that it risks acting like a broad documentation handbook.
- Repo-wide maintenance direction says dense anchors should shrink once support coverage is complete, but `technical-writing` still looks closer to an old handbook than a current routing-first skill.

## Key Insight
The repo does not need another documentation skill. It needs `technical-writing` to behave like the other hardened anchors: one clear internal-docs router, one primary mode per run, strong route-outs to neighboring skills, and support files that hold the slower-changing handbook detail.