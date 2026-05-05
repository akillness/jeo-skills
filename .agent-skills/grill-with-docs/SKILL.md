---
name: grill-with-docs
description: Use this skill when >
  Design review session that stress-tests plans against the existing domain model,
  sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as
  decisions crystallize. Use when validating architecture or plans against a
  project's language and documented decisions.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works best in codebases with CONTEXT.md and docs/adr/ documentation. Creates
  these files lazily if absent. Pairs with improve-codebase-architecture for
  architectural work and triage for issue preparation.
metadata:
  tags: design-review, architecture, domain-model, documentation, adr, context-map
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Grill With Docs

A grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation inline as decisions crystallize.

## When to use this skill

- Validating architectural plans against a project's domain language
- Stress-testing designs before implementation
- Updating CONTEXT.md terminology as new concepts emerge
- Preparing issues for implementation (pairs with `triage`)

## When not to use this skill

- Finding refactoring opportunities → use `improve-codebase-architecture`
- Writing implementation tickets → use `to-issues`
- General code review → use `code-review`

## Session process

### 1. Explore domain context

Before grilling, read:
- `CONTEXT.md` — existing domain terminology
- `docs/adr/` — prior architectural decisions
- Relevant source files to understand current state

### 2. Run the grilling loop

Interview relentlessly about every decision point. For each question:
- Provide a recommended answer
- Ask one question at a time, waiting for feedback before continuing
- Explore the codebase instead of asking when the answer is findable there

### 3. Three stress-test mechanisms

**Glossary alignment** — When the user uses a term that conflicts with CONTEXT.md, call it out:
> "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

**Precision sharpening** — When terms are vague or overloaded, propose canonical names:
> "You're saying 'account' — do you mean the Customer or the User? Those are different things."

**Scenario-based edge-case testing** — When domain relationships are discussed, stress-test with concrete scenarios that probe boundaries between concepts.

### 4. Update docs inline

**CONTEXT.md** — When a term is resolved, update it immediately. Don't batch updates.

File structure for single-context repos:
```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       └── 0001-decision-name.md
```

For monorepos with `CONTEXT-MAP.md` at root, each context has its own `CONTEXT.md` and `docs/adr/`.

Create files lazily — only when you have something to write.

**ADRs** — Only create when all three are true:
1. Hard to reverse (meaningful cost to change later)
2. Surprising without context (future reader would wonder "why?")
3. Result of a real trade-off (genuine alternatives existed)

If any condition is missing, skip the ADR.

## Cross-reference with code

When the user states how something works, verify the code agrees. Surface contradictions:
> "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

## File formats

- CONTEXT.md: domain terminology meaningful to domain experts (no implementation details)
- ADR format: title, status, context, decision, consequences

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
