# Handoff Boundaries

Use this page when a broad UI review discovers a specialist problem that should move to another skill.

## `web-design-guidelines` owns
- broad page or flow audits
- hierarchy, clarity, consistency, states, wayfinding, and launch-readiness review
- combined audit packets that summarize findings across categories
- prioritization and route-outs

## Route to `web-accessibility` when
- keyboard/focus behavior is the main issue
- accessible names, landmarks, semantic HTML, ARIA, contrast, or manual WCAG verification dominate the work
- the user explicitly wants an accessibility remediation plan

## Route to `responsive-design` when
- overflow, stacking, viewport adaptation, or container-aware behavior is the main problem
- the work is mostly about breakpoints, reflow, touch-target density, or narrow-screen layout strategy

## Route to `ui-component-patterns` when
- the main work is reusable primitive design
- you need slot/variant APIs, controlled/uncontrolled boundaries, or component family architecture
- the team is asking how the component library itself should be structured

## Route to `design-system` when
- the main problem is token governance or system-wide visual language
- the team needs foundations for typography, spacing, color, motion, or layout rules across many screens
- the task is about component-library or product-wide design direction rather than one audit packet

## Route to `react-best-practices` when
- the review reveals React-specific state/render anti-patterns
- the main pain is memoization, effects, hydration, server/client boundaries, or rendering structure

## Route to `performance-optimization` when
- the main work is measurement-led tuning
- the team already knows the friction is caused by slow rendering, asset weight, API latency, DB hot paths, or frame-budget issues

## Combined workflow pattern
Often the right flow is:
1. use `web-design-guidelines` to identify the broad problem and prioritize it,
2. route one or two dominant findings outward,
3. return with a consolidated UI audit packet.

Example:
- Broad finding: pricing page feels untrustworthy and hard to scan.
- Keep in `web-design-guidelines`: hierarchy, CTA emphasis, proof ordering, state consistency.
- Route out to `web-accessibility`: low-contrast pricing toggle and missing focus visibility.
- Route out to `responsive-design`: mobile card overflow and broken comparison table stacking.
