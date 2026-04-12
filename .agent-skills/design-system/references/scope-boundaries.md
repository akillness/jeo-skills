# Design System Scope Boundaries

Use `design-system` as the canonical frontend UI-system skill when the job is to define or refine:
- design tokens
- component primitives
- page-level visual hierarchy
- motion guidance
- reusable visual language across screens

## Route to nearby skills instead when

- `frontend-design-system` — only when an existing workflow or exact-name integration explicitly depends on the legacy alias
- `ui-component-patterns` — when the system direction is already decided and the task is about reusable component implementation structure
- `responsive-design` — when the main problem is breakpoint strategy, device adaptation, or responsive QA
- `web-accessibility` — when the main job is WCAG remediation, accessibility audits, or assistive-technology behavior

## Canonical vs alias rule

If a request is about general UI-system design, `design-system` should win. The alias `frontend-design-system` should only survive as a compatibility redirect.
