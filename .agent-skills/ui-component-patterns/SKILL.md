---
name: ui-component-patterns
description: >
  Design reusable UI primitives and component APIs before duplicating product UI.
  Use when the user needs help extracting shared components, defining variants,
  slots, controlled-vs-uncontrolled boundaries, composition patterns, Storybook
  coverage, or deciding what belongs in a reusable primitive versus app-local UI.
  Triggers on: component library, reusable component, button API, modal API,
  slots, variants, compound component, headless component, controlled vs
  uncontrolled, design-system primitive, and too many similar components.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for React, TypeScript, and modern frontend/fullstack repos that need
  reusable component architecture. Not for broad visual-system direction,
  accessibility remediation, viewport-only responsive layout work, or React
  performance tuning.
license: MIT
metadata:
  tags: ui-components, react, typescript, composition, variants, slots, reusable, frontend
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# UI Component Patterns

Use this skill when the main question is **"should this UI be a reusable primitive, what should its API look like, and where should the boundary between shared and product-local code live?"**

The job is not to dump a random React pattern gallery.
The job is to:
1. decide whether a shared component is warranted,
2. define the smallest useful primitive and its API,
3. separate visual variants, behavior, and composition responsibilities,
4. keep adjacent concerns routed to the right neighboring skill,
5. leave behind a concise component brief or implementation plan.

Read [references/component-api-checklist.md](references/component-api-checklist.md) before handling a new primitive or refactoring a duplicated component family.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `ui-component-patterns`, `design-system`, `web-accessibility`, `responsive-design`, `state-management`, or `react-best-practices` should own the next step.

## When to use this skill
- Extract duplicated UI into a shared primitive or component family
- Design button, modal, dropdown, card, table, form-field, or navigation APIs with variants and slots
- Decide between a headless primitive, a styled wrapper, or a product-local component
- Choose controlled vs uncontrolled behavior for reusable components
- Review whether a component API is overfitted, underpowered, or mixing too many responsibilities
- Turn vague requests like “our components are messy” into a concrete architecture brief
- Define Storybook/example coverage for states, variants, and edge cases

## When not to use this skill
- **The main task is system-wide tokens, visual language, contribution governance, or page-level UI direction** → use `design-system`
- **The main task is accessibility remediation, keyboard/focus behavior, labels, or manual a11y verification** → use `web-accessibility`
- **The main task is breakpoints, container queries, responsive media, or viewport adaptation** → use `responsive-design`
- **The main task is app-level state ownership or client/server state boundaries** → use `state-management`
- **The main task is React/Next.js performance, hydration, waterfalls, or rerender behavior** → use `react-best-practices`
- **The task is just implementing a component that already has a settled API**; in that case implement directly instead of reopening the architecture decision

## Instructions

### Step 1: Decide whether a reusable primitive is justified
Do not create a shared component just because two screens look similar.

Use this threshold test:
- **Create or refactor a primitive** when the same interaction or UI shape appears in multiple places, or will clearly recur
- **Keep it product-local** when the UI is highly specific to one flow and abstraction would mostly add indirection
- **Promote to design-system work** when the decision affects many component families, tokens, naming rules, or contribution policy

Quick framing template:
```markdown
Reuse decision:
- Shared candidate: Button + icon button + loading button
- Why shared: repeated across settings, billing, onboarding, and dashboard
- Keep local: one-off onboarding progress illustration
- Escalate: token naming and spacing scale belong to design-system
```

### Step 2: Classify the component role before writing props
First define what kind of thing you are building.

Use one or more buckets:
- **Primitive** — button, input, text, stack, surface, dialog shell
- **Composite pattern** — modal, command palette, form row, filter bar, card with actions
- **Product-local wrapper** — a domain-specific arrangement built from primitives
- **Headless behavior layer** — state + interactions without final styling
- **Styled opinionated wrapper** — packaged presentation around a stable primitive

If the component mixes multiple roles, split the boundary explicitly instead of letting one API own everything.

### Step 3: Define the smallest useful API surface
A good shared component solves recurring needs without turning into a kitchen sink.

Ask:
1. What are the required inputs?
2. Which differences are true variants versus arbitrary styling escape hatches?
3. Which parts should be slots/children instead of dozens of props?
4. Which behavior can stay internal, and which must be controlled by the parent?
5. What should remain product-local rather than being generalized now?

Common design rules:
- prefer a few meaningful `variant`, `size`, `tone`, or `state` props over many one-off booleans
- prefer composition/slots when consumers need structured flexibility
- keep DOM passthroughs intentional; do not blindly expose every internal implementation detail
- if consumers constantly need `className` plus several “temporary” escape hatches, the primitive boundary is probably wrong

Bad pattern:
```tsx
<Button
  primary
  secondary
  ghost
  compact
  isDanger
  iconLeft={...}
  iconRight={...}
  forceMobileLayout
  customSpacing="12px"
/>
```

Better pattern:
```tsx
<Button variant="primary" size="md" tone="default" leadingIcon={<SaveIcon />}>
  Save
</Button>
```

### Step 4: Choose controlled vs uncontrolled ownership deliberately
Reusable components become fragile when ownership is unclear.

Use **controlled** APIs when:
- the parent must coordinate state with routing, analytics, forms, or other components
- the current value/open state is part of a larger workflow
- external validation or async lifecycle should own transitions

Use **uncontrolled/internal** ownership when:
- the component is simple and self-contained
- external coordination is unnecessary
- a default value/open state is enough

Healthy pattern:
```tsx
<Accordion value={value} onValueChange={setValue} />
<Accordion defaultValue="shipping" />
```

If a component needs both, provide a clear controlled + uncontrolled model instead of a half-controlled hybrid.

### Step 5: Separate structure, styling, and behavior
Do not let one component API carry every concern.

Useful splits:
- **Behavior primitive** — focus/open/selection/keyboard logic
- **Structure/composition** — slots, subcomponents, layout skeleton
- **Styling layer** — variants, tokens, class mapping
- **Product wrapper** — domain-specific copy, analytics, business rules

This is where headless or compound-component patterns often help.

Example split:
```markdown
Dialog primitive owns:
- open/close lifecycle
- focus return
- overlay semantics

App wrapper owns:
- billing copy
- submit side effects
- analytics events
- product-specific button labels
```

### Step 6: Handle common pattern families with the right lens
#### Buttons and actions
Prioritize semantic role, variant count, loading/disabled behavior, icon labeling, and consistent affordance.

#### Dialogs, drawers, menus, command palettes
Prioritize composition boundaries, open-state ownership, close reasons, focus expectations, and slot structure.

#### Form fields
Prioritize label/help/error placement, controlled vs uncontrolled data flow, field wrappers versus raw inputs, and extensibility for validation states.

#### Tables, cards, list items, nav patterns
Prioritize slot structure, action placement, density variants, and avoiding props that only encode one screen’s layout.

#### Headless primitives
Use when multiple visual treatments need the same behavior. Do not reach for them if the team cannot maintain the extra composition complexity.

### Step 7: Capture responsive, accessibility, and state concerns as constraints — not ownership theft
This skill should acknowledge neighboring concerns without absorbing them.

Examples:
- note that a primitive must support keyboard/focus behavior, then route remediation details to `web-accessibility`
- note that a component needs mobile and desktop adaptations, then route layout strategy to `responsive-design`
- note that an accordion’s open state may need parent ownership, then route broader app state questions to `state-management`
- note that token or primitive naming rules should stay consistent with `design-system`

If the main question changes from component API architecture to another concern, hand off explicitly.

### Step 8: Produce the component architecture packet
End with a concise artifact that another engineer or agent can execute.

Preferred format:
```markdown
# Component Architecture Packet

## Component family
- Name:
- Role: primitive | composite | wrapper | headless
- Shared vs local decision:

## API shape
- Required props:
- Variants / slots:
- Controlled vs uncontrolled:
- Escape hatches allowed:

## Boundaries
- Keeps:
- Routes to neighboring skills:

## Examples to implement or document
1. ...
2. ...
3. ...

## Verification
- States/variants covered:
- Storybook/examples needed:
- Accessibility follow-up:
- Responsive follow-up:
```

## Examples

### Example 1: Button family drift
**Input:** “We have five button implementations and people keep adding ad hoc props.”

**Good output direction:**
- decide there should be one shared action primitive plus a narrower icon-button variant
- collapse random booleans into a small variant/tone/size set
- keep analytics and one-off layout wrappers outside the primitive
- route token naming to `design-system`

### Example 2: Modal API confusion
**Input:** “Should our modal manage its own state or always be controlled by the parent?”

**Good output direction:**
- classify the modal as a reusable composite pattern
- recommend controlled ownership when workflow state, routing, or async submit logic matters
- allow an uncontrolled convenience path for simple confirmations if the API stays clear
- route keyboard/focus remediation details to `web-accessibility`

### Example 3: Reusable versus local card
**Input:** “Should this pricing card become a shared component?”

**Good output direction:**
- keep the domain-specific marketing card local if only one page needs it
- extract shared sub-primitives only if repeated slots/actions truly recur
- route page-level visual-system concerns to `design-system`

## Best practices
1. Prefer the smallest reusable primitive that removes repeated work without inventing a framework.
2. Treat slots/composition as a tool for real flexibility, not an excuse to skip API design.
3. Keep controlled/uncontrolled behavior explicit; half-controlled components create the worst maintenance burden.
4. Write down route-outs to `design-system`, `web-accessibility`, `responsive-design`, `state-management`, and `react-best-practices` whenever the boundary is mixed.
5. Document state, variants, loading/error/empty behavior, and responsive edge cases in examples or Storybook coverage.
6. Avoid prop explosions that encode one product screen instead of a reusable concept.
7. Revisit the abstraction when consumers repeatedly need escape hatches or wrappers to use it.

## References
- [React — Thinking in React](https://react.dev/learn/thinking-in-react)
- [Storybook Docs](https://storybook.js.org/docs)
- [Brad Frost — Atomic Design](https://bradfrost.com/blog/post/atomic-web-design/)
- [Radix UI Primitives Overview](https://www.radix-ui.com/primitives/docs/overview/introduction)
