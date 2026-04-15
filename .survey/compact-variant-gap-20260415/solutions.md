# Solution Landscape: compact-variant gap

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Leave the gap alone | Do nothing | Zero immediate effort | Keeps runtime/docs drift alive; rediscovery cost remains | Reject |
| Weaken the docs claim | Edit README/setup to stop promising universal `SKILL.toon` coverage | Fastest truth-fix | Accepts lower discovery quality instead of finishing the support layer | Fallback only |
| Finish remaining compact variants | Add `SKILL.toon` / compact files for the last missing skills | Removes measurable drift; improves runtime symmetry; no new skills added | Requires careful per-skill summary sync | Best bounded ratchet |
| Build a generator first | Automate compact file generation repo-wide | Could scale later | Larger loop, evaluator drift, and more moving parts than needed for 8 remaining gaps | Overkill for this run |

## Categories
- **No-change / defer**: leave the gap alone
- **Docs-only truthfulness**: weaken the docs claim
- **Support-completion**: finish the remaining compact variants
- **Automation-first**: build a generator before fixing the current gaps

## What People Actually Use
Inside this repo, maintainers already treat compact variants as derived runtime artifacts rather than optional extras. The practical behavior is not “invent a new skill” or “rewrite docs every time” — it is to finish the support layer for bounded leftover gaps after modernizations land.

## Frequency Ranking
1. Finish remaining compact variants
2. Weaken docs claim if the sweep is too large for the run
3. Build automation later as a separate maintenance track
4. Leave the gap alone

## Key Gaps
- 8 skills still lack compact variants: `clawteam`, `game-build-log-triage`, `game-ci-cd-pipeline`, `game-demo-feedback-triage`, `lmstudio-cli`, `obsidian-plugin`, `research-paper-writing`, `steam-store-launch-ops`.
- The game cluster is disproportionately visible in README/setup and still carries 4 of those 8 gaps.

## Contradictions
- Repo docs describe every skill folder as shipping `SKILL.toon`, but the filesystem still has a small set of missing compact variants.
- The standardization skill treats compact files as derived discovery artifacts, but the repo still has leftover holes from older modernization waves.

## Key Insight
The highest-leverage move is not another new skill and not a docs downgrade by default. It is a bounded support-completion pass that finishes the remaining compact discovery variants so the repo’s tiered discovery story becomes true in practice again.
