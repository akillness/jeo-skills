---
name: migrate-to-shoehorn
description: Use this skill when >
  Migrate TypeScript test files from unsafe `as` type assertions to type-safe
  alternatives from @total-typescript/shoehorn. Replace `obj as Type` with
  fromPartial(), `obj as unknown as Type` with fromAny(), and complete specs
  with fromExact(). Test code only — never use in production.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  TypeScript projects only. Test code exclusively — production usage is prohibited.
  Requires npm install @total-typescript/shoehorn. Pairs with testing-strategies
  and backend-testing for broader test quality work.
metadata:
  tags: typescript, testing, type-safety, assertions, migration, shoehorn
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Migrate to Shoehorn

Replace unsafe TypeScript `as` assertions in test files with type-safe alternatives from `@total-typescript/shoehorn`.

## When to use this skill

- Modernizing test code to eliminate `as` type assertion anti-patterns
- Making test data creation type-safe with autocomplete support
- Migrating from `as unknown as Type` double-assertions

## When not to use this skill

- Production code (shoehorn is **test code only**)
- Non-TypeScript projects
- Runtime type validation → use a library like `zod`

## Installation

```bash
npm i @total-typescript/shoehorn
```

## The three functions

### `fromPartial<T>(partial)` — incomplete objects

Use when you only need a few properties of a large type:

```typescript
// Before (unsafe)
const user = { name: "Alice" } as User

// After (type-safe, keeps autocomplete)
import { fromPartial } from "@total-typescript/shoehorn"
const user = fromPartial<User>({ name: "Alice" })
```

### `fromAny<T>(value)` — intentionally wrong data

Use when testing with deliberately incorrect data (error cases, edge cases):

```typescript
// Before (verbose double-as)
const badInput = { invalid: true } as unknown as User

// After
import { fromAny } from "@total-typescript/shoehorn"
const badInput = fromAny<User>({ invalid: true })
```

### `fromExact<T>(complete)` — enforced complete objects

Use when the test requires a fully-specified object (no missing fields):

```typescript
// Before
const user = { name: "Alice", email: "alice@example.com", id: 1 } as User

// After (TypeScript will error if any field is missing)
import { fromExact } from "@total-typescript/shoehorn"
const user = fromExact<User>({ name: "Alice", email: "alice@example.com", id: 1 })
```

## Migration workflow

### 1. Find all `as` assertions in test files

```bash
grep -rn " as " --include="*.test.ts" --include="*.spec.ts" --include="*.test.tsx"
```

### 2. Classify each assertion

- Partial object, only some fields needed → `fromPartial()`
- Intentionally wrong/invalid data → `fromAny()`
- Complete object, all fields present → `fromExact()`

### 3. Replace and add import

```typescript
import { fromPartial, fromAny, fromExact } from "@total-typescript/shoehorn"
```

### 4. Verify TypeScript still compiles

```bash
npx tsc --noEmit
```

## Critical constraint

**Test code only.** Never use `fromPartial`, `fromAny`, or `fromExact` in production code. These functions bypass type safety for testing purposes only.

## Instructions
1. Identify the task trigger and expected output.
2. Follow the workflow steps in this skill from top to bottom.
3. Validate outputs before moving to the next step.
4. Capture blockers and fallback path if any step fails.

## Examples
- Example: Apply this skill to a small scope first, then scale to full scope after validation passes.

## Best practices
- Keep outputs deterministic and auditable.
- Prefer small reversible changes over broad risky edits.
- Record assumptions explicitly.

## References
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
