# Handoff Boundaries for `responsive-design`

Use this file when multiple frontend skills could plausibly activate.

## Keep work in `responsive-design` when
- the main job is viewport/container adaptation, overflow control, reflow planning, responsive media, or layout verification
- the user asks about breakpoints, mobile-first baselines, container queries, wrapping, or layout collapse across widths
- the problem is deciding how a page or layout surface should adapt across available space

## Route to `ui-component-patterns` when
- the real question is reusable primitive or component-family API design
- the issue is variants, slots, compound components, or controlled-vs-uncontrolled ownership rather than responsive layout rules

## Route to `web-accessibility` when
- the main problem is reflow remediation, touch targets, semantics, keyboard/focus behavior, labels, or manual accessibility verification
- accessibility is the core task rather than one verification dimension among several

## Route to `design-system` when
- the task is about shared breakpoint policy, token scales, primitive naming, or governance across many products/components
- multiple component families need one system-level responsive rule before local implementation can proceed

## Route to `web-design-guidelines` when
- the user wants a broad UI/design audit instead of implementation-first responsive strategy
- the request is mostly about overall interface quality, consistency, or guideline compliance

## Mixed cases
When a request spans multiple skills, split the answer explicitly:
- `responsive-design` owns layout-adaptation strategy and verification
- neighboring skills own reusable component APIs, accessibility remediation, system governance, or broad UI review

Do not hide unclear ownership by dumping every frontend concern into breakpoint advice.
