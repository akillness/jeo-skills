# Solution Landscape: responsive-design structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Intrinsic layout first | Fluid sizing, auto-fit/minmax grid, flex-wrap, content-driven sizing before conditional rules | Most portable; reduces breakpoint sprawl; works across stacks | Does not solve every dense-data or component-slot problem by itself | Best default front-door recommendation |
| Viewport media queries | Mobile-first page/layout shifts based on screen width | Universal support; good for page-shell changes | Overused for component-local behavior; encourages breakpoint soup | Should stay explicit but not dominate the skill |
| Container queries | Parent-width-driven component adaptation | Strong for reusable cards/panels/sidebars; reduces viewport coupling | Newer mental model; can hide bad component APIs if misused | Strong evidence for a separate packet inside the skill |
| Utility CSS responsive variants | Tailwind/utility-prefix breakpoint handling | Fast shipping; visible breakpoint vocabulary | Class/override sprawl; encourages patch-level fixes | Useful implementation route, not the primary architecture answer |
| Component-library responsive props | MUI/Chakra/theme-breakpoint APIs | Centralized tokens; fast app delivery | Verbose; abstraction leaks; weaker for unusual layouts | Relevant route when the repo is library-heavy |
| Design-system breakpoint governance | Shared tokens, scales, density, and breakpoint policy | Cross-product consistency; durable governance | Slow to establish; not a local page-fix answer | Confirms `design-system` route-out |
| Responsive images/media | `srcset`, `sizes`, `<picture>`, aspect ratio, framework image helpers | Handles layout + performance together | Easy to misconfigure; art direction adds complexity | Deserves a dedicated packet instead of scattered notes |
| Dense-data/table fallbacks | Intentional horizontal scroll, stacked cards, disclosure, column prioritization | Pragmatic for dashboards and admin surfaces | No universal best answer; easy accessibility regressions | Strong sign that responsive work needs packet selection, not generic CSS advice |

## Categories
- **Core layout mechanisms**: intrinsic layout, flex/grid wrapping, mobile-first media queries
- **Conditional adaptation**: viewport media queries, container queries
- **Framework/library layers**: Tailwind, Bootstrap, MUI, Chakra responsive APIs
- **Governance**: design-system breakpoint/token policy
- **Media/content handling**: responsive images, embeds, aspect-ratio decisions
- **Dense-data exceptions**: tables, toolbars, filters, dashboards, long-label navs

## What People Actually Use
Most teams use a mixed workflow: browser resize + a few remembered breakpoints + screenshot proof + one or two pragmatic fallbacks for hard surfaces like tables or crowded toolbars. Even with stronger modern guidance, the everyday problem is still deciding which responsive packet to use, not remembering that media queries exist.

## Frequency Ranking
1. Intrinsic layout plus a small viewport-query layer
2. Utility/framework responsive variants
3. Component-library responsive props and theme breakpoints
4. Design-system breakpoint governance
5. Container queries for reusable component slots
6. Responsive media/image handling
7. Table/dense-data fallback patterns

## Key Gaps
- Most solution inventories explain mechanisms, but they do not help an agent quickly classify **viewport vs container vs dense-data vs media vs verification** as one primary packet.
- Dense-data and verification/reflow cases still need judgment-heavy route-outs; generic responsive guides tend to bury this under long CSS examples.
- Container-query guidance improves component reuse but does not replace the need to route API-ownership questions to `ui-component-patterns`.
- Broad UI critique and accessibility remediation still get mixed into responsive requests unless the front door is strict about boundaries.

## Contradictions
- Marketed claim: responsive design is mostly “mobile-first CSS + breakpoints.”
  User reality: teams still rely on screenshots, DevTools resizing, table-specific fallbacks, and manual reflow checks.
- Marketed claim: container queries solve responsive component reuse cleanly.
  User reality: they help only when the component structure is already sane; otherwise the problem is really component API design.
- Marketed claim: framework/library responsive helpers provide a complete responsive strategy.
  User reality: they speed implementation but do not answer ownership, dense-data fallbacks, or verification requirements.

## Key Insight
The strongest transferable improvement is not another responsive helper or more syntax examples. It is a smaller routing-first front door that names one responsive packet, keeps intrinsic-layout-vs-query choice explicit, and routes accessibility, component-API, design-system, and broad UI-review work outward before the skill turns into a generic frontend catch-all.

## Curated Sources
- `graphify-out/GRAPH_REPORT.md`
- `.agent-skills/responsive-design/SKILL.md`
- MDN Responsive Design: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design
- MDN Using media queries: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries
- MDN Container Queries: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- MDN Responsive Images: https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Responsive_images
- web.dev Learn Responsive Design: https://web.dev/learn/design
- W3C WAI Reflow: https://www.w3.org/WAI/WCAG21/Understanding/reflow.html
- Tailwind Responsive Design: https://tailwindcss.com/docs/responsive-design
- Bootstrap Breakpoints: https://getbootstrap.com/docs/5.3/layout/breakpoints/
- MUI Breakpoints: https://mui.com/material-ui/customization/breakpoints/
- Chakra Responsive Design: https://chakra-ui.com/docs/styling/responsive-design
- DataTables Responsive extension: https://datatables.net/extensions/responsive/
- TanStack Table column visibility guide: https://tanstack.com/table/latest/docs/guide/column-visibility
