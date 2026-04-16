# Solution Landscape: design-system structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Short front door + support packets | Keep `SKILL.md` as the routing layer and move detail into focused `references/` docs | Better trigger clarity, easier maintenance, lower prompt weight, easier reuse | Requires disciplined packet design and sync | Strongest repo-local and external pattern |
| Concern-based information architecture | Separate tokens, foundations, components, patterns, accessibility, governance, and adoption | Matches mature design-system docs and prevents mixed ownership | Can sprawl if every concern becomes a peer surface | Best fit for `design-system` hardening |
| Decision-first checklist before examples | Triage request mode and route-outs before showing code/spec examples | Prevents example overfitting and keeps adjacent boundaries explicit | Requires better examples, not just fewer examples | Common in newer repo skills |
| Governance/adoption packet | Add contribution/change-policy and system-level boundary guidance | Makes the skill useful for cross-product systems, not just one page mock | Harder to keep current if too broad | Currently underrepresented in `design-system` |
| Giant example-dump skill | Keep one big file with tokens, examples, motion, and checklists inline | Easy to author initially, lots of concrete material | Poor routing, weaker maintainability, stale drift risk, noisy activation surface | Current anti-pattern to reduce |

## Categories
- **Entry and routing**: short front door, clear `when not to use`, explicit route-outs
- **Decision support**: mode selection, packet template, handoff checklist
- **Knowledge architecture**: tokens/foundations, page-system guidance, governance, accessibility/motion baseline
- **Governance and operations**: adoption phases, contribution rules, canonical-vs-alias ownership
- **Example strategy**: a few curated examples after the routing and packet rules

## What People Actually Use
In this repo, the stronger frontend skills already follow the packetized model:
- `responsive-design` loads a layout-decision checklist + handoff doc before deep guidance.
- `ui-component-patterns` loads component-API and boundary docs before examples.
- `web-design-guidelines` and `web-accessibility` both end with concise packet outputs instead of huge example dumps.
- `react-grab` explicitly says to prefer reference docs over bloating the front door.

Mature public design systems show the same pattern:
- Atlassian splits guidance into get-started, foundations, components, patterns, accessibility, and release phases.
- GOV.UK splits styles, components, patterns, accessibility, and community.
- USWDS separates getting started, settings, design tokens, accessibility, and maturity guidance.

## Frequency Ranking
1. Short front door + deeper support references
2. Concern-based IA (tokens/foundations, components/patterns, accessibility, governance)
3. Decision checklist or triage flow before implementation examples
4. Explicit route-outs / ownership boundaries
5. Governance / lifecycle / contribution guidance
6. Curated examples after rules, not instead of rules

## Key Gaps
- `design-system` is canonical but still structurally older than neighboring frontend anchors.
- The canonical folder has only one reference doc while adjacent skills use multiple focused packets.
- The compact surface still describes a UI generator more than a bounded router.
- The skill still carries stale related-skill residue (`image-generation`).

## Contradictions
- Public discovery surfaces present `design-system` as the canonical frontend anchor, but the body still behaves like an older monolithic tutorial.
- The alias layer is structurally clearer about routing than the canonical layer in some places, which is backwards.

## Key Insight
The best bounded improvement is not another frontend wrapper or more alias work. It is to harden `design-system` into the same operating shape as the repo's stronger frontend anchors: a short router that classifies the request, routes neighboring work outward early, and leaves behind a compact design-system packet while focused token/governance/page-system detail moves into references.

## Curated Sources
- Repo-local: `.agent-skills/design-system/SKILL.md`, `.agent-skills/design-system/references/scope-boundaries.md`, `.agent-skills/responsive-design/SKILL.md`, `.agent-skills/ui-component-patterns/SKILL.md`, `.agent-skills/web-design-guidelines/SKILL.md`, `.agent-skills/web-accessibility/SKILL.md`, `.agent-skills/react-grab/SKILL.md`
- Primary docs: `https://atlassian.design/`, `https://design-system.service.gov.uk/`, `https://designsystem.digital.gov/`, `https://www.w3.org/WAI/ARIA/apg/`, `https://www.designtokens.org/tr/drafts/format/`
