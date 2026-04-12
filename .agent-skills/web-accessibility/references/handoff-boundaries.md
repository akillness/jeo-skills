# Handoff Boundaries for `web-accessibility`

Use this file when multiple frontend skills could plausibly activate.

## Keep work in `web-accessibility` when
- the main job is fixing or verifying accessibility behavior
- the user mentions a11y, WCAG, keyboard trap, focus return, labels, ARIA, screen readers, contrast, reduced motion, or manual accessibility checks
- the question is what still needs manual or assistive-technology verification after an automated scan

## Route to `web-design-guidelines` when
- the request is a broader UI audit, design/polish review, or multi-rule compliance review
- accessibility is only one part of a wider review surface
- the user asks to review UI files against general interface/design guidance

## Route to `ui-component-patterns` when
- the main question is primitive/component API shape, composition, slots, variants, or controlled-vs-uncontrolled design
- accessibility is a constraint on the component architecture, not the whole task

## Route to `design-system` when
- the work is about token, primitive, pattern-library, or system-governance direction
- the team needs rules for multiple components before remediating one instance

## Route to `responsive-design` when
- the main failure is viewport adaptation, breakpoint behavior, responsive media, or mobile layout
- accessibility semantics are secondary to the layout problem

## Mixed cases
When a request spans multiple skills, split the answer explicitly:
- `web-accessibility` owns remediation and verification for the a11y failure
- neighboring frontend skills own broader review, API architecture, or layout concerns

Do not force one skill to own everything if the better answer is a divided plan.
