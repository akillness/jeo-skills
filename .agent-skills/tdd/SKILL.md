---
name: tdd
description: >
  Test-Driven Development using red-green-refactor cycles with vertical slices.
  Tests verify behavior through public interfaces, not implementation details.
  Use when building new features or fixing bugs with a test-first discipline to
  produce well-designed, behavior-verified code.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Language-agnostic. Works for unit, integration, and component tests. Best for
  new feature development and bug fixes. Not for writing test suites after the fact
  (use testing-strategies) or for debugging existing failures (use debugging/diagnose).
metadata:
  tags: tdd, test-driven-development, red-green-refactor, vertical-slices, behavior-verification
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# TDD — Test-Driven Development

Build features and fix bugs using the test-first red-green-refactor cycle. Tests specify observable behavior through public interfaces — they survive internal refactors.

## Core philosophy

> Tests should verify behavior through public interfaces, not implementation details.

Good tests read like specifications. They tell you *what* the system does, not *how* it does it.

## When to use this skill

- User requests test-first development or red-green-refactor
- Building new features where behavior should drive design
- Fixing bugs where a regression test should come first
- Any work where test design should precede implementation

## When not to use this skill

- Writing tests after implementation → use `testing-strategies`
- Debugging existing failures → use `debugging` or `diagnose`
- Broad test-policy decisions → use `testing-strategies`

## Anti-pattern: horizontal slices

❌ Write all tests upfront before any implementation.

This produces tests that verify *imagined* behavior, not *actual* behavior. They become insensitive to real changes because they were written before design decisions were made.

## Correct approach: vertical slices

✅ One test → minimal implementation → repeat.

Each slice is a thin cut through the full behavior. Completed slices are independently demoable.

## Workflow

### Step 1 — Planning

Before writing any code:

- Confirm the interface design with the user
- Identify which behaviors matter most (prioritize)
- Get approval on the test approach before coding

### Step 2 — Tracer bullet

Write the first test for the most important behavior:

```
RED: write a failing test for one behavior
GREEN: write the minimum code to make it pass
COMMIT: the behavior is now specified and verified
```

The tracer bullet proves the test infrastructure works and establishes the pattern.

### Step 3 — Incremental loop

Repeat for each subsequent behavior:

```
RED → GREEN → (optional REFACTOR) → next RED
```

Rules:
- Write only enough code to pass the current test
- Do not anticipate future requirements
- Each test must fail before the implementation exists
- Each test must pass after the minimal implementation

### Step 4 — Refactor

After all behaviors are tested and passing:

- Extract duplication into shared helpers
- Deepen modules (simple interface, rich behavior)
- Run tests after each refactor step
- Never refactor while tests are red

## Per-cycle checklist

Before moving to the next cycle, verify the test:

- [ ] Describes observable behavior (not implementation internals)
- [ ] Uses only public interfaces
- [ ] Would survive an internal refactor of the implementation
- [ ] Fails for the right reason before implementation
- [ ] Passes with minimal, non-speculative code

## Example

```typescript
// RED: write the failing test first
test('formats currency with symbol', () => {
  expect(formatCurrency(1000, 'USD')).toBe('$1,000.00')
})

// GREEN: write minimal passing code
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

// REFACTOR if needed, then move to next behavior
```
