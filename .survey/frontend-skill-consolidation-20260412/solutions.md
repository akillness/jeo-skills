# Solution Landscape: Frontend skill consolidation

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Canonical skill + compatibility alias | Keep one canonical skill, narrow the alias to migration/platform-specific use | Lowest trigger ambiguity, preserves old name, reduces future drift | Requires docs/manifest updates to stay clear | Best fit for the React pair |
| Hard merge/remove duplicate | Delete the duplicate skill and keep only one folder | Maximum cleanup | Can break users/tools expecting the old name | Better after a longer deprecation window |
| Keep both but sharpen scope boundaries | Rewrite descriptions so each skill owns a distinct job to be done | Preserves multiple entry points | Still more maintenance than one canonical entry | Better for adjacent-not-identical skills |
| Support-file consolidation | Put evals/references on the canonical skill and keep aliases thin | Ratchets quality without duplicating support assets | Requires discipline in future updates | Strong complement to canonical/alias cleanup |
| Eval-gated split/merge decisions | Keep separate skills only if evals can distinguish them | Objective and transferable | Takes extra setup | Good policy for future overlap reviews |

## Categories
- **Canonical + alias:** best for true duplicates or legacy names.
- **Differentiate by job:** best when nearby skills are adjacent but not identical.
- **Support consolidation:** centralize evals/references on the canonical skill.
- **Deprecation/redirect pattern:** mirror docs-style aliases rather than shipping full duplicate payloads.

## What People Actually Use
Repo evidence already points to canonical-vs-variant behavior: the variant `vercel-react-best-practices` tells readers to prefer `react-best-practices` for general use, which means maintainers have already implicitly chosen the canonical path. The actual gap is that catalog metadata and docs do not express that clearly enough before activation.

## Frequency Ranking
1. Canonical skill plus alias/redirect
2. Sharper boundary descriptions for adjacent skills
3. Centralized support files on the canonical entry
4. Eval-gated decisions for future split/merge calls
5. Hard merge/remove after a deprecation window

## Key Gaps
- The current React pair is only weakly separated at the metadata layer.
- The canonical React skill lacks eval coverage even though it is deep and reusable.
- Variant naming still appears as a first-class frontend option in docs/setup surfaces.

## Contradictions
- Marketed/current inventory behavior: the frontend inventory presents both React skills as peers.
- User reality inside the skill: the variant already says the generic skill is the preferred default.

## Key Insight
The highest-value move is not adding another frontend skill; it is making the canonical React skill easier to trigger and validating it with evals, while shrinking the variant into an explicit compatibility alias so README, setup, and manifest surfaces stop implying that two near-identical React performance skills should compete equally.
