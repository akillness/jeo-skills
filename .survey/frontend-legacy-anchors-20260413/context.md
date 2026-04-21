# Context: Frontend legacy anchor modernization

## Workflow Context
The remaining legacy frontend anchors (`responsive-design` and `ui-component-patterns`) sit in a frontend cluster that recently got sharper around state ownership, accessibility remediation, and design-system boundaries. In real product workflows, teams usually solve responsive behavior and component reuse together, but they feel the pain differently:

1. **Reusable component pain is continuous delivery pain** — duplicated buttons/forms/modals/cards, inconsistent variant handling, copy-paste component forks, and weak documentation all slow product work every week.
2. **Responsive pain is broad but diffuse** — breakpoint sprawl, page-specific overrides, and viewport regressions matter, but the ownership is spread across CSS/layout architecture, accessibility, QA, and design review.
3. **The repo’s stronger frontend anchors now expect route-outs** — `state-management` owns ownership/state boundaries, `web-accessibility` owns remediation + verification, `design-system` owns system-level tokens/primitives, and `react-best-practices` owns rendering/performance. That leaves `ui-component-patterns` as the most obvious remaining reusable-frontend anchor to modernize next.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend product engineer | Ship reusable screens, forms, modals, tables, and flows without constant copy-paste | Intermediate–advanced |
| Design-system / platform engineer | Define primitives, variants, and migration rules across apps | Advanced |
| Tech lead / staff frontend engineer | Decide what belongs in shared UI versus product-local code | Advanced |
| Designer working with engineering | Translate variants/states from Figma into reusable implementation guidance | Intermediate |
| QA / accessibility reviewer | Re-test repeated interactions across many screens because shared components diverge | Intermediate |

## Current Workarounds
1. **Copy the closest existing component and tweak locally** — fast now, expensive later.
2. **Use Storybook/Figma/docs as partial truth sources** — helpful, but production code still drifts.
3. **Add one-off responsive CSS and override hooks** — solves the screen in front of the engineer, not the underlying boundary problem.
4. **Create “shared” components with escape hatches everywhere** — preserves velocity but weakens API clarity and consistency.
5. **Rely on PR review to enforce reuse rules informally** — works until reviewers or deadlines change.

## Adjacent Problems
- `design-system` owns system-level token/primitives/governance work and should stay broader than one component API discussion.
- `web-accessibility` owns semantic, keyboard, focus, labeling, and manual accessibility verification work inside components, but not the whole primitive API architecture.
- `responsive-design` should stay focused on viewport/container adaptation, layout primitives, responsive media, and breakpoint strategy rather than swallowing every reusable component discussion.
- `state-management` owns controlled/uncontrolled data ownership only when the problem is app/workflow state architecture rather than component API ergonomics.
- `web-design-guidelines` owns broad multi-rule UI/design/polish audits, not component API design.

## User Voices
> “We have several versions of the same component.” — recurring practitioner complaint surfaced in design-system and frontend community discussions; duplication and local forks remain the dominant maintenance smell.
- Brad Frost, Atomic Design: https://bradfrost.com/blog/post/atomic-web-design/
- Storybook docs/use cases: https://storybook.js.org/docs

> “It’s faster to duplicate than abstract.” — common product-engineering behavior when shared primitives are underdesigned or hard to evolve.
- Nielsen Norman Group on design-system consistency pressures: https://www.nngroup.com/articles/design-systems-101/
- React docs on thinking in components: https://react.dev/learn/thinking-in-react

> “Responsive behavior is usually patched locally even in teams with component libraries.” — repeated pattern across MDN/web.dev guidance and practitioner writeups about breakpoint sprawl and ad hoc CSS.
- MDN Responsive Design: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design
- web.dev Responsive Design Basics: https://web.dev/responsive-web-design-basics/

## Survey decision
The best bounded modernization target for this run is **`ui-component-patterns`**, not `responsive-design`.

Why:
- It addresses the most common day-to-day duplication and drift problem.
- It has cleaner route-outs to neighboring skills.
- It can absorb responsive constraints *inside* reusable component guidance without becoming a generic CSS/layout encyclopedia.
- It is more likely to benefit from support files (`references/`, `evals/`) and sharper trigger wording than a broad layout-oriented rewrite would in one run.
