# Handoff Boundaries for `ui-component-patterns`

Use this file when multiple frontend skills could plausibly activate.

## Keep work in `ui-component-patterns` when
- the main job is designing or refactoring a reusable primitive or component family
- the user asks about variants, slots, controlled-vs-uncontrolled APIs, compound components, or headless/styled splits
- the problem is deciding what should become shared versus remain product-local

## Route to `design-system` when
- the task is about system-wide tokens, primitive naming, contribution governance, or visual-language rules
- multiple component families need a shared system policy before one API can be finalized

## Route to `web-accessibility` when
- the main problem is keyboard/focus behavior, labels, semantic HTML, ARIA, contrast, reduced motion, or manual accessibility verification
- accessibility is the core remediation task rather than one constraint among many

## Route to `responsive-design` when
- the main problem is layout adaptation across viewports or containers
- the user primarily needs breakpoint, container-query, responsive media, or mobile-layout guidance

## Route to `state-management` when
- the real question is app/workflow state ownership rather than component API ergonomics
- client/server state boundaries or cross-page ownership dominate the problem

## Route to `react-best-practices` when
- the main concern is hydration, rendering performance, waterfalls, rerender behavior, or Next.js performance architecture
- the component API is already acceptable and performance is the actual bottleneck

## Mixed cases
When a request spans multiple skills, split the answer explicitly:
- `ui-component-patterns` owns reusable primitive/API architecture
- neighboring skills own accessibility remediation, responsive strategy, broader system governance, or runtime performance

Do not force one skill to own every frontend concern if the better answer is a divided plan.
