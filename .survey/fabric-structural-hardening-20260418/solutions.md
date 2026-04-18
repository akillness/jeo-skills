# Solution Landscape: fabric structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep current `fabric` skill unchanged | Leave the six-mode modernized skill as-is | No migration cost; already accurate on core boundary | Front door remains large; duplicates reference material; slower trigger scan | Baseline for this run |
| Shrink `fabric` into a routing-first front door + support packet | Keep mode chooser in `SKILL.md`, move deeper operator detail into references | Faster activation, clearer route-outs, easier compact-surface sync | Requires careful doc sync so discovery surfaces stay honest | Best bounded candidate |
| Add another Fabric-adjacent helper skill | Split server mode, pattern packs, or shell pipelines into separate wrappers | Smaller individual pages | Creates duplicate trigger surfaces and noisier catalog | Rejected unless a truly distinct user intent appears |
| Reposition Fabric as a generic AI terminal client | Broaden trigger wording toward any CLI prompting | High nominal recall | False positives against LLM CLIs and coding assistants | Contradicts upstream product shape |

## Categories
- **Canonical in-place hardening:** keep `fabric` as the single Fabric skill but reduce front-door weight.
- **Catalog-splitting alternatives:** create a new helper for server mode or custom patterns.
- **Over-broad alternatives:** market Fabric as a generic CLI assistant or generic automation substrate.

## What People Actually Use
The upstream project still centers around patterns, stdin/file composition, custom pattern packs, and server mode rather than repo-aware coding. In practice, operators appear to use Fabric as a reusable transform layer around existing text artifacts, while provider setup and server/runtime quirks remain the recurring friction. That means the skill’s main job is still choosing the right mode and handing off exact commands or scaffolds, not acting like an all-purpose CLI AI encyclopedia.

## Frequency Ranking
1. **Routing-first in-place hardening** — best fit for repo maintenance because it preserves the canonical boundary without creating another wrapper.
2. **Keep unchanged** — acceptable but leaves a known graph/watchlist problem unresolved.
3. **Split into another helper skill** — only justified if a new persistent intent appears.
4. **Broaden to generic AI CLI** — worst option because it weakens trigger precision.

## Key Gaps
- The front door still repeats operator detail that can live in support docs.
- Compact/discovery surfaces should stay synchronized with any narrower wording.
- The skill still benefits from a clearer packet reference for mode selection + route-outs under the repo’s newer routing-first pattern.

## Contradictions
- Fabric’s upstream README is broad because it has to document installation, features, examples, extensions, and API surfaces. The skill does not need to mirror that breadth; it needs a narrower trigger boundary.
- Server mode is important enough to keep, but not important enough to dominate the front door over the common pattern-first CLI transform path.

## Key Insight
The durable win is not another Fabric wrapper. It is making the existing `fabric` skill smaller and more decisive: one primary pattern-first intake lane, explicit route-outs for ad hoc prompting/coding/automation, and support-owned detail for operator packets, provider setup, and server mode.
