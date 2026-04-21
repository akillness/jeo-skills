# Design System Scope Boundaries

Use `design-system` when the job is to define or refactor shared UI-system rules across multiple pages, products, or component families.

## Keep work in `design-system` when
- the team needs shared token scales, semantic naming, density policy, motion rules, or breakpoint policy
- the question is about primitive naming, contribution governance, or cross-product visual language
- multiple surfaces need one coherent system direction before local implementation proceeds
- the right deliverable is a compact Design System Packet, not a page-only critique or component-only API spec

## Route to `ui-component-patterns` when
- the main task is designing or refactoring one reusable primitive or component-family API
- the question is about variants, slots, compound components, controlled-vs-uncontrolled ownership, or Storybook/example coverage
- system naming may stay here, but the real implementation brief belongs there

## Route to `responsive-design` when
- the main task is viewport/container adaptation, overflow control, breakpoint behavior, reflow, or mobile layout verification
- the system may define breakpoint or density policy here, but the actual layout-collapse strategy belongs there

## Route to `web-accessibility` when
- the main task is accessibility remediation or verification
- the user is asking about keyboard/focus behavior, semantic HTML, ARIA, labels, contrast failures, or manual assistive-technology checks
- this skill should keep only the shared baseline expectations

## Route to `web-design-guidelines` when
- the main task is a broad page or flow critique for hierarchy, clarity, polish, CTA emphasis, consistency, or launch readiness
- the user wants a UI audit packet rather than shared-system governance

## Canonical vs alias rule
If the request is about general UI-system direction, `design-system` should win.
The alias `frontend-design-system` survives only as a compatibility redirect for exact-name workflows.

## Mixed cases
When a request spans multiple lanes, split the answer explicitly:
- `design-system` owns shared rules and governance
- neighboring skills own component API architecture, layout adaptation, accessibility remediation, or broad critique

Do not hide unclear ownership by calling every frontend question “design-system work.”
