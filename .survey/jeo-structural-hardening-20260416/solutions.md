# Solution Landscape: JEO structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep JEO as one giant operational file | Continue using a single `SKILL.md` for routing, setup, state schema, and troubleshooting | One file to read; no indirection | Already over the recommended limit; harder trigger scanning; more drift risk | Current baseline in `.agent-skills/jeo/SKILL.md` |
| Split reference-heavy sections into `references/` while keeping the workflow core in `SKILL.md` | Preserve trigger surface in the main file and move slower-changing detail out | Better scanability; easier maintenance; still one canonical skill | Requires careful cross-linking and compact-surface refresh | Best bounded fit for this run |
| Create another orchestration wrapper skill for resume/state/setup | New skill dedicated to one slice like ledger/state or cross-platform setup | Localized docs for one concern | Adds duplicate pressure in the most crowded cluster; weakens `jeo` as the front door | Rejected by existing wiki guidance |
| Collapse more runtime/platform behavior into `jeo` | Make `jeo` more self-contained by absorbing `omc` / `omx` / `ohmg` / `ralphmode` detail | Fewer handoffs in theory | Blurs cluster boundaries and increases maintenance cost | Contradicts current cluster map |
| Push everything into README/setup docs and thin out `jeo` heavily | Treat top-level docs as the real manual and keep `SKILL.md` very short | Lower SKILL length | Risks divergence between runtime instructions and skill behavior; hides operational truth outside the skill package | Too aggressive for a bounded maintenance pass |

## Categories
- **Monolith**: one big skill file that tries to carry runtime flow, installation, config, state, and troubleshooting.
- **Structured split**: keep the route/decision surface in `SKILL.md`, move platform/state/troubleshooting detail to `references/`.
- **Wrapper proliferation**: add another skill for a sub-problem instead of improving the existing anchor.
- **Docs-first indirection**: offload too much operational detail to README/setup docs.

## What People Actually Use
In this repo, the practical pattern is not to create a new wrapper whenever a high-visibility skill gets dense. The recent maintenance loop repeatedly improved the existing anchor (`survey`, `google-workspace`, `react-best-practices`, `skill-autoresearch`, `ralph`, etc.), added support files, refreshed compact discovery artifacts, and only updated README/setup docs when positioning materially changed. The orchestration-cluster wiki page says the same thing for `jeo`: it should compose neighboring skills, not flatten their ownership.

## Frequency Ranking
1. **Improve the existing anchor in place** — dominant pattern in recent wiki/log entries.
2. **Add or refresh support files** — the preferred way to shrink and clarify high-signal skills without losing operational depth.
3. **Refresh compact/discovery artifacts after a material trigger-surface change** — required when the main description or routing surface changes.
4. **Create another wrapper skill** — consistently rejected in this cluster unless the current skill cannot own the problem cleanly.

## Key Gaps
- `jeo` still mixes route-selection content with reference-only detail.
- The state-schema / platform-config / troubleshooting material is useful but not first-pass trigger material.
- The file is now large enough that maintainers have to read past the core orchestration loop to find the parts most likely to change.

## Contradictions
- Marketed role: `jeo` is the clean cross-platform front door.
- Current reality: the file also behaves like a deep maintenance manual, which makes it harder to act like a front door.

## Key Insight
The best bounded move is not another orchestration skill. It is to preserve `jeo` as the integrated router, keep the PLAN → EXECUTE → VERIFY → CLEANUP contract in the main file, and move slower-changing platform/state/troubleshooting detail into reference docs with explicit route-outs to `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, and `ralphmode`.
