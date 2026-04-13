# Solution Landscape: Responsive design modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| MDN + web.dev responsive docs | Platform guidance | Canonical baseline for mobile-first layouts, media queries, responsive media, and viewport behavior | Broad and educational rather than workflow-specific | Best foundation for `responsive-design` principles |
| MDN container queries | Container-aware CSS guidance | Modernizes responsive work beyond viewport-only breakpoints | Easy to overuse without layout discipline | Strong evidence that the skill should teach container-based thinking |
| WCAG reflow guidance | Accessibility verification overlay | Forces responsive work to include zoom/reflow usability, not only pretty layouts | Not a complete layout strategy by itself | Important verification boundary with `web-accessibility` |
| Tailwind responsive utilities | Practical implementation pattern | Familiar utility-first syntax and mobile-first breakpoint conventions | Can encourage local override sprawl when architecture is weak | Useful implementation example, not the whole skill |
| Design systems / UI frameworks (MUI, Chakra, Carbon, etc.) | System-level responsive components and layout tokens | Provide practical responsive APIs and layout constraints | Opinionated and framework-specific | Better as examples than as the repo’s ownership model |

## Categories
- **Platform guidance** — MDN / web.dev responsive fundamentals.
- **Container-aware adaptation** — container queries and intrinsic layout.
- **Framework implementation** — utility-class or component-library responsive APIs.
- **System governance** — breakpoint/token policy across many apps.
- **Verification overlays** — reflow, overflow, zoom, and regression testing.

## What People Actually Use
In practice, teams mix:
1. global breakpoints or utility classes,
2. local media-query patches,
3. component-library defaults,
4. browser resize testing,
5. late accessibility or QA review for overflow/reflow issues.

That behavior suggests the repo needs a skill that helps agents choose:
- when a problem is really viewport/container adaptation,
- when a component API decision belongs in `ui-component-patterns`,
- when reflow/zoom/touch issues should hand off to `web-accessibility`,
- and when the work has escalated into `design-system` governance.

## Frequency Ranking
1. **Mobile-first + flexible layout guidance** — most universal and still core.
2. **Container-query / component-container adaptation** — modern high-value addition.
3. **Framework-specific responsive utilities** — useful but secondary.
4. **Broad audit or review overlays** — adjacent, not the main ownership lane.

## Key Gaps
- The current `responsive-design` skill is a long example dump and does not clearly state when it should trigger versus route out.
- It lacks support files for layout heuristics, verification, and boundary handling.
- It underplays container queries, intrinsic layout, and verification planning.
- Discovery docs still describe it too generically to distinguish it from adjacent frontend skills.

## Contradictions
- **Marketed claim:** responsive design is solved by a few breakpoints.
- **User reality:** teams still accumulate local overrides, overflow fixes, and screen-specific patches because layout constraints are not framed early enough.

- **Marketed claim:** component libraries make everything responsive automatically.
- **User reality:** real content, container widths, tables, forms, and navigation still need deliberate adaptation and verification.

## Key Insight
`responsive-design` should be rewritten as the repo’s **layout-adaptation and verification anchor**: mobile-first, intrinsic-layout, and container-aware responsive strategy with explicit handoffs to `ui-component-patterns`, `web-accessibility`, `design-system`, and `web-design-guidelines`. That is narrower and more durable than a generic CSS tutorial, and it fills a real gap left after the `ui-component-patterns` modernization.
