# Solution Landscape: Frontend legacy anchor modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Material Design / Carbon / Polaris / Atlassian Design System | Official design-system guidance | Strong pattern vocabulary, layout rules, component expectations, accessibility-aware direction | Often too broad or brand-opinionated for a single skill to mirror directly | Best for system-level references and reusable component behavior examples |
| Storybook | Component workbench + docs | Makes component variants/states visible, supports visual review and isolated examples | Docs can drift from shipped UI; isolated stories miss workflow composition | Strong evidence that component-centric workflows are how teams operationalize reuse |
| React docs + composition patterns | Framework guidance | Clear “thinking in components” baseline, supports composition-first design | Too generic on governance and long-lived component-library maintenance | Good trigger/ownership source for `ui-component-patterns` |
| Headless/component libraries (Radix UI, MUI, Chakra, Tailwind UI-style ecosystems) | Implementation references | Show real APIs for primitives, slots, composition, variants, responsive props | Opinionated or framework-specific; easy to cargo-cult | Useful for boundary examples, not for direct duplication |
| MDN / web.dev / Every Layout | Platform/layout guidance | Strong for responsive behavior, container/media query thinking, intrinsic layout | Better for `responsive-design` than for component API ownership | Important adjacency for route-outs |
| UX / design-review sources (NN/g, curated pattern galleries) | Review and critique guidance | Surfaces where component and layout decisions fail real users | Often principle-heavy or screenshot-level | Better as review context than as the core implementation skill |

## Categories
- **Reusable component API and composition guidance** — props, slots, controlled vs uncontrolled boundaries, variants, states, primitive extraction.
- **Component documentation workflows** — Storybook, examples, state matrices, visual review, migration notes.
- **Responsive/layout primitives** — media queries, container queries, intrinsic layout, responsive media, breakpoint strategy.
- **System-level UI governance** — tokens, pattern ownership, cross-app consistency, contribution rules.
- **Review / audit overlays** — accessibility checks, broad interface-guideline reviews, UX/polish audits.

## What People Actually Use
Teams rarely use a single source of truth. The real stack is usually:
1. Figma or design docs for intended variants and states
2. Storybook or equivalent docs for component examples
3. Production code as the actual truth
4. PR review + local overrides to handle edge cases
5. Ad hoc CSS / responsive patches when the shared primitive is not expressive enough

That behavior points toward a skill that helps agents decide:
- when to create or extend a primitive,
- how to design a variant/state API,
- when to route layout-only issues to `responsive-design`,
- and when a question has escalated into `design-system` territory.

## Frequency Ranking
1. **Component-centric reuse guidance** — highest leverage and closest to daily frontend work
2. **Design-system docs and pattern libraries** — strong references, but broader than one implementation skill
3. **Responsive/layout guidance** — very important, but more diffuse and better handled as an adjacent anchor
4. **Broader UX / design review sources** — useful for critique, less useful as a primary ownership skill

## Key Gaps
- `ui-component-patterns` is still a long example-heavy legacy skill and does not clearly answer *when* it should trigger or *when* it should hand work to `design-system`, `web-accessibility`, `state-management`, `responsive-design`, or `react-best-practices`.
- It lacks support files for API-shape decisions, handoff boundaries, and evaluation prompts.
- Discovery docs still describe it too generically, which weakens activation quality and overlap handling.

## Contradictions
- **Marketed claim:** component libraries and design systems solve reuse by default.
- **User reality:** teams still copy-paste, fork local variants, and maintain “shared-but-overridable” components because the shared abstraction is either too rigid or underdefined.

- **Marketed claim:** responsive behavior is a separate, teachable checklist.
- **User reality:** responsive behavior is usually embedded inside component and layout decisions, then patched locally when the shared abstraction falls short.

## Key Insight
The repo will compound better by modernizing **`ui-component-patterns` as the reusable primitive / variant / composition anchor** and leaving `responsive-design` as a narrower adjacent skill for viewport/container adaptation. That keeps the modernization bounded, aligns with how teams actually structure frontend work, and creates a cleaner handoff map across the already-modernized frontend cluster.
