---
name: ui-component-patterns
description: >
  Routing-first reusable component architecture for shared frontend primitives,
  slots, controlled ownership, alternate-root composition, and docs/verification
  packets. Use when the user needs to decide what should become a shared
  primitive, how a component API should expose variants or subcomponents, when
  parent state should control the component, how to compose a button/link/dialog
  onto alternate element types, or what Storybook/example coverage is required.
  Route design-token or cross-product governance to `design-system`,
  accessibility-heavy remediation to `web-accessibility`, layout adaptation to
  `responsive-design`, app-level state ownership to `state-management`, and
  React performance work to `react-best-practices`.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for React, TypeScript, and frontend/fullstack repos where the main job is
  reusable component API architecture. Not for full design-system governance,
  accessibility-only remediation, responsive layout strategy, or React/Next.js
  performance tuning as the primary owner.
license: MIT
metadata:
  tags: ui-components, react, typescript, composition, variants, slots, reusable, frontend
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  source: akillness/jeo-skills
  modernization: 2026-04-13
  hardening: 2026-04-19
---

# UI Component Patterns

Use this skill when the job is to **classify the reusable component problem, choose one primary component packet, and leave behind a short component-architecture brief instead of a giant React-pattern dump**.

The job is not to catalog every possible component pattern.
The job is to:
1. identify the reusable component pressure first,
2. choose one bounded packet,
3. keep shared-vs-local and parent-vs-component ownership visible,
4. separate alternate-root composition from broader system or accessibility work,
5. route neighboring frontend concerns honestly.

Read these support docs first:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/component-api-checklist.md](references/component-api-checklist.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)

## When to use this skill
- A team has too many similar buttons, cards, dialogs, field wrappers, or nav patterns and needs one shared primitive or component-family boundary.
- A request mixes variants, slots, controlled-vs-uncontrolled behavior, wrappers, and docs expectations and needs routing before implementation.
- You need to decide whether something should stay product-local, become a shared primitive, or split into primitive plus wrapper.
- A component API is growing escape hatches and someone needs to shrink it into one honest packet.
- The tricky part is alternate-root composition (`button` vs `a`/router `Link`, slotted child, custom wrapper) rather than pure styling.
- Storybook/examples exist, but the docs/verification packet for states, usage rules, or edge cases is still unclear.

## When not to use this skill
- **The main task is token governance, visual-language rules, primitive naming policy, or cross-product system direction** → `design-system`
- **The main task is keyboard/focus behavior, semantics, labels, announcements, contrast, or manual accessibility remediation** → `web-accessibility`
- **The main task is viewport/container adaptation, breakpoint strategy, reflow, or responsive media** → `responsive-design`
- **The main task is broader app/workflow state ownership, server/client boundaries, or cross-screen state coordination** → `state-management`
- **The main task is rerender churn, hydration, route performance, or bundle/runtime behavior** → `react-best-practices`
- **The reusable component boundary is already settled and the real job is just implementing it**; in that case implement directly instead of reopening the architecture decision

## Instructions

### Step 1: Frame the reusable component job before naming props
Capture the minimum intake packet first.

```yaml
component_intake:
  surface: button-action | form-field | dialog-overlay | nav-menu | card-list-item | table-toolbar | mixed | unknown
  workflow_type: new-primitive | duplicate-cleanup | api-review | wrapper-split | docs-verification | unknown
  primary_packet: primitive-boundary | slot-anatomy | controlled-ownership | alternate-root-composition | docs-verification | mixed | unknown
  ownership_pressure: shared-vs-local | parent-state | wrapper-proliferation | type-safety | docs-drift | mixed | unknown
  signal_source: repeated-components | bug-report | code-review | storybook-gap | design-review | migration | mixed | unknown
  confidence: high | medium | low
```

Rule: do **not** start with “add a prop.” First label the reusable component pressure.

### Step 2: Choose exactly one primary component packet
Use the router in [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Primary packets:
1. `primitive-boundary`
2. `slot-anatomy`
3. `controlled-ownership`
4. `alternate-root-composition`
5. `docs-verification`

Pick the packet that resolves the current decision. List anything else as follow-up, not as equal co-owners.

### Step 3: Keep the invariants visible
These rules survive every serious answer:
- shared components should solve repeated work, not invent a local framework for one screen
- product-specific copy, analytics, workflow rules, and layout quirks usually belong in wrappers, not the primitive
- variants should express stable meaning (`tone`, `size`, `density`, `state`) rather than one-off screen exceptions
- slots/subcomponents are for structured flexibility, not for hiding a confused API
- if both controlled and uncontrolled behavior are offered, the contract must be explicit and coherent
- alternate-root composition changes semantics and accessibility responsibility; keep that visible
- Storybook/examples are evidence surfaces, not proof that the component boundary is healthy

### Step 4: Build the component packet
Return this structure:

```markdown
# Component Architecture Packet

## Scope
- Surface:
- Workflow type:
- Primary packet:
- Confidence: high | medium | low

## Current signal
- Main symptom:
- Ownership pressure:
- What is already known:
- What still needs direct verification:

## Recommended first slice
1. ...
2. ...
3. ...

## Component decisions
- Shared vs local:
- Primitive / wrapper split:
- Variants or slots:
- Controlled vs uncontrolled:
- Alternate-root or wrapper rules:

## Docs and verification
- Stories/examples required:
- State / variant matrix:
- Accessibility follow-up:
- Responsive follow-up:

## Ownership and route-outs
- Primary owner:
- Adjacent skills / teams:
```

### Step 5: Use the packet, not a giant pattern gallery
Pull the packet from [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Packet rules:
- `primitive-boundary` → decide shared vs local scope, primitive vs wrapper split, and what absolutely stays outside the shared API
- `slot-anatomy` → define subcomponents/slots, variant boundaries, composition rules, and anatomy expectations for reusable structure
- `controlled-ownership` → decide whether parent state, workflow state, or component-local defaults own the lifecycle
- `alternate-root-composition` → handle `asChild` / `component` / wrapper-root behavior, prop spreading, refs, and semantic constraints when the primitive must compose onto another element
- `docs-verification` → define Storybook/examples, state matrix, anti-usage notes, and the smallest credible verification surface for the component family

### Step 6: Keep mechanism choice separate from ownership choice
Use this split in serious answers:
- **Mechanism** — variants, slots, subcomponents, controlled props, polymorphic root, wrapper split, docs matrix
- **Ownership** — `ui-component-patterns`, `design-system`, `web-accessibility`, `responsive-design`, `state-management`, or `react-best-practices`

If the request starts from screenshots, Storybook drift, or a code diff, say explicitly that those artifacts are the **signal**, not the finished component decision.

### Step 7: Route adjacent work explicitly
Use these route-outs when the problem crosses boundaries:
- token governance, primitive naming, contribution policy, or cross-product component standards → `design-system`
- keyboard/focus remediation, label/announcement issues, ARIA, contrast, reduced motion, or manual a11y verification → `web-accessibility`
- viewport/container adaptation, reflow, responsive media, or dense-data layout strategy → `responsive-design`
- app/workflow state ownership, server/client state boundaries, URL/form/global-store decisions → `state-management`
- rerender churn, hydration, bundle/runtime performance, or route-level performance behavior → `react-best-practices`

When mixed requests appear, keep `ui-component-patterns` on the reusable component packet and name the routed follow-up explicitly.

### Step 8: Prefer honest boundaries over over-generalized props
When a component keeps accumulating booleans, escape hatches, or product-specific rules:
1. check whether the API should split into primitive plus wrapper,
2. collapse accidental variants into a smaller semantic set,
3. move layout- or workflow-specific behavior out of the primitive,
4. route systemic or remediation-heavy follow-ups outward instead of widening the skill.

## Examples

### Example 1: Button family drift
**Input:** “We have five button implementations and people keep adding one-off props.”

**Good output direction:**
- choose `primitive-boundary` as the primary packet
- keep one shared action primitive plus a narrower icon/button-group wrapper if needed
- collapse random booleans into a small variant/tone/size set
- keep analytics and screen-specific layout wrappers outside the primitive
- route token naming to `design-system`

### Example 2: Modal state confusion
**Input:** “Should our modal manage its own state or always be controlled by the parent workflow?”

**Good output direction:**
- choose `controlled-ownership` as the primary packet
- classify the modal as a reusable composite pattern
- recommend controlled ownership when workflow state, routing, or async submit logic matters
- allow an uncontrolled convenience path only if the contract remains explicit
- route keyboard/focus remediation details to `web-accessibility`

### Example 3: Link-button composition
**Input:** “Our design-system button sometimes needs to render as a router link. How should we support that without breaking types or semantics?”

**Good output direction:**
- choose `alternate-root-composition` as the primary packet
- make prop spreading, ref forwarding, and semantic/accessibility constraints explicit
- keep route-level navigation policy or token governance outside the primitive decision
- leave behind a bounded wrapper/root contract instead of a vague “just add an `as` prop” answer

### Example 4: Storybook drift
**Input:** “The component exists, but teams keep using it differently and Storybook is missing the edge cases.”

**Good output direction:**
- choose `docs-verification` as the primary packet
- define the minimum state/variant matrix and example set
- add anti-usage notes and wrapper expectations
- route accessibility-only or responsive-only follow-up packets outward

## Best practices
1. Prefer the smallest reusable primitive that removes repeated work without inventing a local framework.
2. Keep packet choice explicit; one component decision should not silently absorb governance, remediation, responsive strategy, and runtime tuning.
3. Treat slots and subcomponents as structured API tools, not as a way to dodge ownership decisions.
4. Make controlled vs uncontrolled behavior an explicit contract, not an accidental half-state hybrid.
5. Keep alternate-root composition honest about refs, prop spreading, and semantics.
6. Use Storybook/examples as part of the evidence surface, but still write down the docs/verification packet.
7. Revisit the abstraction when consumers repeatedly need escape hatches or app-specific wrappers to use it.

## References
- [Radix UI — Composition](https://www.radix-ui.com/primitives/docs/guides/composition)
- [Material UI — Composition](https://mui.com/material-ui/guides/composition/)
- [Storybook Docs](https://storybook.js.org/docs)
- [shadcn/ui Docs](https://ui.shadcn.com/docs)
