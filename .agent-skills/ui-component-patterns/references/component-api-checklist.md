# Component API Checklist for `ui-component-patterns`

Use this checklist before introducing a new shared primitive or refactoring a duplicated component family.

## 1. Reuse threshold
- Does this interaction appear in multiple places already?
- Is recurrence likely enough to justify a shared abstraction soon?
- If not, would a local component be cleaner for now?

## 2. Component role
Classify the candidate before designing props:
- Primitive
- Composite pattern
- Product-local wrapper
- Headless behavior layer
- Styled wrapper

If more than one role is present, split the boundary.

## 3. API shape
- Which props are truly required?
- Which differences are stable variants versus one-off overrides?
- Which parts belong in slots/children instead of many booleans?
- Which DOM props are safe to pass through intentionally?

## 4. Ownership
- Controlled, uncontrolled, or both?
- If both, is the controlled model explicit and coherent?
- Is parent ownership required for routing, async workflow, or coordination?

## 5. Behavioral scope
- What behavior stays inside the primitive?
- What belongs in a wrapper or domain-specific layer?
- Are analytics, copy, business rules, or layout wrappers leaking into the shared API?

## 6. Verification
- Which variants and states need examples?
- Which loading, error, empty, disabled, or selected states must be documented?
- Is Storybook/example coverage needed?
- What should be handed to `web-accessibility` for remediation details?
- What should be handed to `responsive-design` for layout adaptation details?
