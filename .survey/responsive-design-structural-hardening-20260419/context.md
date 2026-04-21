# Context: responsive-design structural hardening

## Workflow Context
Responsive-design work shows up during ordinary feature delivery, not as a separate CSS-only lane. The current repo skill already targets dashboards, navs, forms, tables, cards, media, and zoom/reflow checks, which matches mainstream platform guidance from MDN, web.dev, and W3C WAI: teams need to decide whether adaptation belongs to the viewport, the container/component slot, the content-density layer, responsive media, or verification/reflow review instead of blindly adding more breakpoints.

The repo-local graph also matters here. `graphify-out/GRAPH_REPORT.md` still lists `responsive-design` on the oversized watchlist, which is now the main maintenance smell because support coverage is already complete across the live catalog. That means the highest-leverage follow-up is structural hardening, not adding a neighboring frontend wrapper.

Key workflow evidence:
- `responsive-design` is currently 277 lines and still carries packet selection, examples, syntax, and route-outs in one front door.
- W3C WAI Reflow guidance keeps responsive work tied to real release-readiness constraints, especially 320 CSS px / 400% zoom behavior and avoiding unnecessary two-dimensional scrolling for ordinary content: https://www.w3.org/WAI/WCAG21/Understanding/reflow.html
- MDN and web.dev both frame responsive design as a choice among layout mechanisms, not a synonym for “add media queries”: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design and https://web.dev/learn/design
- Container queries have shifted more component-level work away from viewport-only thinking: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend engineer | Fix page-shell, grid, nav, form, card, and table breakage across widths | Intermediate to advanced |
| Fullstack engineer | Ship responsive behavior while balancing layout, data density, and release pressure | Intermediate |
| Design-system / platform engineer | Decide when a responsive issue is local layout work versus shared breakpoint/token governance | Advanced |
| QA / accessibility reviewer | Verify overflow, reflow, zoom, and release-readiness behavior beyond one width screenshot | Intermediate |
| Product or launch owner | Needs a short responsive strategy packet for launch-critical pages, dashboards, or flows | Mixed |

## Current Workarounds
1. Add another viewport breakpoint near the width where the page visibly fails, even when the real issue is container ownership or content-density pressure.
2. Use intrinsic layout primitives (`minmax()`, auto-fit grids, flex wrapping, sensible `max-width`) first, then add a thin breakpoint layer only where layout pressure actually appears.
3. Treat dense tables and toolbars as special cases: horizontal scroll, summary views, stacked cards, or disclosure-based fallbacks are used intentionally because pure reflow is often not enough.
4. Use screenshots, browser resize, DevTools device mode, and narrow-width spot checks as the default verification loop, then escalate to real-device/cloud checks only for stubborn bugs.
5. Borrow framework breakpoint conventions (Tailwind, Bootstrap, MUI, Chakra) as vocabulary, while still making manual decisions about wrapping, density, and verification.

## Adjacent Problems
- Accessibility and reflow: many “responsive” bugs are really zoom/reflow or touch-target failures that should route to `web-accessibility` once layout ownership is clear.
- Component API architecture: reusable cards, toolbars, and panels often need `ui-component-patterns` instead of more breakpoint logic.
- System governance: cross-product breakpoint/token policy belongs to `design-system`, not to a page-level responsive triage skill.
- Broad UI critique: launch-readiness, polish, and hierarchy reviews belong to `web-design-guidelines` even when responsiveness is one of the findings.
- Performance/media selection: responsive images and media sizing overlap with performance concerns, but the first job is still to name the layout/media packet honestly.

## User Voices
- “This page breaks on mobile.” — existing `responsive-design` intake language in `.agent-skills/responsive-design/SKILL.md`
- “The same card lives in a sidebar, a feed, and a 2-column grid. Should we use container queries or more viewport breakpoints?” — existing eval language and a canonical container-query use case.
- “This form still breaks at 400% zoom and keyboard users lose context.” — existing eval language showing that responsive work often borders accessibility remediation.
- “Review this signup flow before launch. I need hierarchy, CTA, state, mobile, and accessibility basics checked.” — `web-design-guidelines` intake language showing why responsive work must stay separate from broad UI audit ownership.

Sources:
- `graphify-out/GRAPH_REPORT.md`
- `.agent-skills/responsive-design/SKILL.md`
- `.agent-skills/responsive-design/references/layout-decision-checklist.md`
- `.agent-skills/responsive-design/references/handoff-boundaries.md`
- MDN Responsive Design: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design
- MDN Container Queries: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- web.dev Learn Responsive Design: https://web.dev/learn/design
- W3C WAI Reflow: https://www.w3.org/WAI/WCAG21/Understanding/reflow.html
