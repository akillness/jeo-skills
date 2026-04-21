# UI Component Intake Packets and Route-Outs

Use this file after the intake is classified. The goal is to pick **one primary reusable-component packet** and keep adjacent frontend work outside the main answer unless it is truly primary.

## Packet router

| Packet | Use when | First decisions | Common route-outs |
|---|---|---|---|
| `primitive-boundary` | The team is unsure whether the thing should become shared, stay local, or split into primitive plus wrapper | shared vs local, primitive vs wrapper, allowed variants, what stays out of the primitive | `design-system` for cross-product primitive policy; `responsive-design` if layout behavior is the real blocker |
| `slot-anatomy` | The main confusion is subcomponents, slots, compound structure, or variant anatomy | slots/subcomponents, variant boundaries, composition rules, product-local escape hatches | `design-system` for system-wide anatomy standards; `web-accessibility` when semantics/focus rules become primary |
| `controlled-ownership` | Parent workflow state and component-local defaults are fighting each other | controlled vs uncontrolled contract, default props, callback ownership, wrapper responsibilities | `state-management` if broader app/workflow state is the real issue |
| `alternate-root-composition` | The component must render onto another element or wrapper (`button` vs link, `asChild`, `component`, custom trigger) | prop spreading, ref forwarding, semantic safety, wrapper/root contract | `web-accessibility` for remediation-heavy semantic/focus follow-up; `design-system` for shared cross-product conventions |
| `docs-verification` | The component exists, but teams keep using it inconsistently or docs/examples are thin | minimum story matrix, anti-usage notes, wrapper examples, verification expectations | `web-accessibility` or `responsive-design` if the main missing proof is a11y or layout-specific |

## Selection rules
1. Pick the packet that answers the **current decision**, not every downstream concern.
2. If both shared-boundary and ownership-state questions exist, choose whichever is blocking implementation now and list the other as follow-up.
3. If the only honest answer is “our stories or screenshots prove too little,” choose `docs-verification`.
4. If the real problem is token governance, accessibility remediation, responsive layout strategy, or runtime performance, route out early instead of hiding it under component language.

## Invariants
- Shared components should remove repeated work, not encode one screen's quirks.
- Variants should stay semantic and small; repeated escape hatches usually mean the boundary is wrong.
- Wrapper/product logic belongs outside the primitive unless the primitive truly owns that responsibility.
- Alternate-root composition must keep refs, prop spreading, and semantics visible.
- Storybook/examples are evidence surfaces, not proof that the API boundary is healthy.

## Output reminder
A good answer ends with one short packet:
- primary packet
- first slice
- component decisions
- docs/verification
- route-outs
