# Solution Landscape: ui-component-patterns structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Radix UI Primitives | Headless accessible primitives with `asChild`, slotting, refs, and composition contracts | Strong primitive vocabulary for design-system assembly; honest about prop-spread/ref requirements | Powerful but easy to misuse; composition and slottable-child constraints can confuse teams | Canonical evidence for routing around slots, refs, and alternate roots ([Radix Composition](https://www.radix-ui.com/primitives/docs/guides/composition)) |
| Material UI | Styled component system with composition, `component`, wrappers, slot props, and theme-driven APIs | Broad enterprise API surface; clear docs for composition and slot forwarding | Heavy abstraction surface; wrapper/slot complexity can leak into app code | Strong evidence for wrapper + slot-prop packet needs ([MUI Composition](https://mui.com/material-ui/guides/composition/)) |
| shadcn/ui | Copy-and-own local component architecture built from primitives | Fast adoption, high local control, clear examples | Fixes and contracts drift across apps; wrapper duplication is common | Strong signal that teams often prefer local ownership over central packages ([shadcn/ui Docs](https://ui.shadcn.com/docs)) |
| React Aria | Accessibility and interaction logic as lower-level hooks/components | Robust semantics and behavior building blocks | Verbose mental model for small teams; still requires local wrappers | Good evidence that behavior/state often belongs in a support packet, not the front door ([React Aria](https://react-spectrum.adobe.com/react-aria/)) |
| Headless UI | Unstyled accessible components oriented toward composition and utility-first styling | Fast for Tailwind-heavy teams; accessible defaults | Less portable beyond expected render/styling patterns | Reinforces headless-vs-styled decision as a recurring branch ([Headless UI](https://headlessui.com/)) |
| Storybook | Component-driven docs, examples, and interaction/test surface | Strong for demos, state matrices, and discoverability | Easy for docs to drift from app reality; weak as sole governance surface | Supports adding docs/verification packet guidance ([Storybook Docs](https://storybook.js.org/docs)) |

## Categories
- **Headless / primitive-first:** Radix UI, React Aria, Headless UI
- **Styled component systems:** Material UI, Chakra UI, Primer, Polaris
- **Copy-and-own local layers:** shadcn/ui and internal `components/ui` patterns
- **Documentation / validation surfaces:** Storybook, design-system anatomy pages, interaction tests, visual review
- **API contract patterns:** controlled vs uncontrolled ownership, slots/subcomponents, polymorphism, ref forwarding, data-state attributes

## What People Actually Use
Teams often mix a vendor primitive layer with app-local wrappers rather than consuming one perfect reusable library. In practice they keep `components/ui`, `design-system`, or wrapper folders inside the product repo, use copy-and-own primitives where necessary, and then rely on Storybook plus side-channel docs for examples, edge cases, and migration notes. The real operating model is usually **local wrapper ownership over shared primitives**, not pure vendor consumption.

## Frequency Ranking
1. Composition-first primitives and wrappers
2. Controlled/uncontrolled API decisions
3. Variant/token-driven styling rules
4. Slot/subcomponent anatomy
5. Storybook/example-driven docs
6. Copy-and-own local component layers
7. Interaction/a11y verification around complex widgets

## Key Gaps
- Solution docs explain **how** to compose primitives, but teams still need a router for **which component packet to apply first**.
- Market docs are strong on props/examples, weaker on **handoff boundaries** between component API design, responsive layout, accessibility remediation, system governance, and runtime performance.
- Storybook and component galleries help demonstrate states, but they rarely define one compact **decision packet** for wrappers, slots, alternate roots, or docs/test expectations.
- Copy-and-own workflows are popular, yet few solutions package the **ownership tradeoff** cleanly enough for an agent skill to route without absorbing adjacent domains.

## Contradictions
- More flexibility (`asChild`, `component`, slots, wrappers) increases reuse but also expands the misuse surface and type/accessibility failure modes.
- Headless and copy-and-own systems promise control, but that same control pushes maintenance, drift, and wrapper proliferation back onto app teams.
- Storybook is often presented as the component documentation center, but real usage rules and edge-case constraints still leak into README / issues / design docs.

## Key Insight
The best bounded follow-up is not another frontend wrapper skill. The gap is a **routing-first front door** for `ui-component-patterns`: classify the component job, choose one packet (primitive boundary, slot/subcomponent anatomy, controlled ownership, alternate-root composition, or docs/verification), and route adjacent concerns out early. That keeps the skill honest to the real pain surfaced by Radix, MUI, shadcn/ui, and Storybook without letting it expand into design-system governance, accessibility-only remediation, or responsive-layout strategy.
