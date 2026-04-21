# Context: Responsive design modernization

## Workflow Context
Responsive behavior keeps showing up in product work, but usually as **layout adaptation inside ongoing feature delivery** rather than as a standalone “teach me media queries” problem. The strongest recurring patterns in the source set are:

1. **Mobile-first remains the baseline** — MDN’s responsive-design guidance still frames responsive work around flexible layouts, media queries, breakpoints, and the viewport meta tag instead of retrofitting desktop-first screens later.
2. **Responsive behavior is no longer only about viewport breakpoints** — MDN’s container-query guide moves adaptation closer to the component/container boundary, which matters for reusable cards, nav, forms, and dashboards.
3. **Responsive work overlaps with accessibility verification** — WCAG 2.1 Reflow ties responsive behavior to real usability constraints such as avoiding two-dimensional scrolling at narrow widths / high zoom.
4. **The repo’s frontend cluster now has cleaner neighbors** — `ui-component-patterns` owns reusable primitive/API architecture, `web-accessibility` owns remediation/verification, `web-design-guidelines` owns broad UI audits, and `design-system` owns system governance.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend product engineer | Adapt pages and components across mobile, tablet, desktop, and large-screen contexts | Intermediate–advanced |
| Design-system / platform engineer | Define layout primitives, breakpoints, container behavior, and responsive constraints for reusable UI | Advanced |
| Full-stack engineer | Ship responsive behavior without becoming a CSS specialist | Intermediate |
| Designer working with engineering | Translate layout intent and breakpoints into implementation-ready rules | Intermediate |
| QA / accessibility reviewer | Catch overflow, zoom/reflow, viewport regression, and touch-target issues across breakpoints | Intermediate |

## Current Workarounds
1. **Patch layouts screen-by-screen** with ad hoc media queries, utility overrides, and one-off CSS classes.
2. **Treat component libraries as automatically responsive** even when local containers, text lengths, or real content density still break layouts.
3. **Use viewport breakpoints only** and ignore container-based adaptation until components become hard to reuse.
4. **Rely on manual device resizing in the browser** instead of writing explicit responsive verification steps.
5. **Let accessibility or design review catch reflow issues late** rather than defining responsive constraints up front.

## Adjacent Problems
- `ui-component-patterns` owns reusable component API shape; `responsive-design` should mention responsive constraints without swallowing component-architecture ownership.
- `web-accessibility` owns zoom/reflow, keyboard/touch-target, and manual a11y follow-up when responsive failures become compliance/usability remediation.
- `web-design-guidelines` owns broad “review this UI” and polish audits rather than implementation-first responsive architecture.
- `design-system` owns system-wide breakpoint/tokens/governance decisions when the task spans many component families.
- `react-best-practices` owns runtime performance/hydration questions; responsive strategy should not become a React performance wrapper.

## User Voices
> “Responsive web design (RWD) is a web design approach to make web pages render well on all screen sizes and resolutions while ensuring good usability.”
- MDN: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design

> “Container queries enable you to apply styles to an element based on certain attributes of its container.”
- MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries

> “Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions” at a width equivalent to 320 CSS pixels.
- W3C WCAG 2.1 Reflow: https://www.w3.org/WAI/WCAG21/Understanding/reflow.html

## Survey decision
The best bounded next move is to **modernize `responsive-design`** into a layout-adaptation and verification skill, not a generic CSS encyclopedia and not a duplicate of `ui-component-patterns`.

Why:
- The merged `ui-component-patterns` rewrite clarified the component-API lane, leaving responsive layout adaptation as the clearest remaining frontend anchor.
- The modern source set is now centered on mobile-first + intrinsic layout + container-query thinking, which the current legacy skill barely frames.
- A sharper responsive skill can add durable route-outs to `web-accessibility`, `design-system`, `web-design-guidelines`, and `ui-component-patterns` while staying practical.
