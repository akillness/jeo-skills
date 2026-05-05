---
name: improve-codebase-architecture
description: Use this skill when >
  Identify architectural friction and propose deepening opportunities — refactors
  that turn shallow modules into deep ones for better testability and AI-navigability.
  Use when improving architecture, finding refactoring opportunities, consolidating
  tightly-coupled modules, or making a codebase more testable.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works best in codebases with CONTEXT.md domain documentation. Creates CONTEXT.md
  lazily when absent. Pairs with grill-with-docs for terminology refinement and
  code-refactoring for implementation.
metadata:
  tags: architecture, refactoring, deep-modules, testability, locality, leverage
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. Goal: testability and AI-navigability.

## Vocabulary (use these terms exactly)

- **Module** — anything with an interface and implementation (function, class, package, slice)
- **Interface** — everything a caller must know: types, invariants, error modes, ordering, config
- **Depth** — leverage at the interface: much behavior behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation
- **Seam** — where an interface lives; a place behavior can be altered without editing in place
- **Adapter** — a concrete thing satisfying an interface at a seam
- **Leverage** — what callers get from depth
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place

**Key principles:**
- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

## When to use this skill

- User wants architectural improvement opportunities
- Codebase is hard to navigate or test
- Modules feel tightly coupled or shallow
- Refactoring would improve testability

## When not to use this skill

- Quick targeted refactors → use `code-refactoring`
- Design review of a plan → use `grill-with-docs`
- Implementation tickets → use `to-issues`

## Process

### 1. Explore

Read domain glossary (`CONTEXT.md`) and ADRs first. Then walk the codebase organically, noting friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted for testability, but real bugs hide in how they're called?
- Where do tightly-coupled modules leak across seams?
- Which parts are untested or hard to test through their current interface?

Apply the **deletion test** to suspected shallow modules.

### 2. Present candidates

Numbered list of deepening opportunities. For each:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture causes friction
- **Solution** — plain English description of what would change
- **Benefits** — in terms of locality, leverage, and test improvement

Use `CONTEXT.md` vocabulary for domain terms. Use the vocabulary above for architecture terms.

**ADR conflicts**: if a candidate contradicts an ADR, only surface it when friction is real enough to warrant revisiting. Mark clearly: *"contradicts ADR-0007 — but worth reopening because…"*

Ask: "Which of these would you like to explore?" — do NOT propose interfaces yet.

### 3. Grilling loop

Once user picks a candidate, drop into a grilling conversation. Walk the design tree: constraints, dependencies, module shape, what sits behind the seam, what tests survive.

Side effects as decisions crystallize:
- **New concept not in CONTEXT.md?** Add the term immediately
- **Fuzzy term sharpened?** Update CONTEXT.md right there
- **User rejects with a load-bearing reason?** Offer an ADR (only when a future explorer would need it to avoid re-suggesting the same thing)

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
