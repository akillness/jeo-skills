---
name: code-refactoring
description: >
  Refactor code safely with a behavior-preserving workflow for decomposition,
  duplication removal, naming cleanup, module splits, and repeated API
  migrations. Use when the user wants to simplify a messy implementation,
  shrink an oversized function or component, make a diff more reviewable, or
  plan a codemod-style cleanup without changing intended behavior. Triggers on:
  refactor this, extract method, split this component, remove duplication,
  rename safely, clean up this code, behavior-preserving rewrite, and codemod /
  migration cleanup. Route root-cause diagnosis to `debugging`, review judgment
  to `code-review`, validation-program design to `testing-strategies`, and
  measurement-led tuning to `performance-optimization`.
allowed-tools: Read Grep Glob Bash Write
compatibility: >
  Best for CLI, backend, frontend, fullstack, and game-programming codebases
  where the main task is improving structure without changing intended
  behavior. Not for proving why a bug exists, approving a PR, setting org-wide
  test policy, or profiling performance bottlenecks.
metadata:
  tags: refactoring, code-quality, codemod, behavior-preservation, technical-debt, cleanup
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Code Refactoring

Use this skill when the main question is **"how do we improve this code's structure without changing what it is supposed to do?"**

The job is not to dump design-pattern examples.
The job is to:
1. frame the refactor goal and risk surface,
2. choose the right refactor mode,
3. freeze or verify behavior before broad edits,
4. make the change in the smallest reviewable slices,
5. route neighboring work to the right skill when the task stops being a refactor.

Read [references/refactor-modes.md](references/refactor-modes.md) before handling an unfamiliar cleanup request.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `code-refactoring`, `debugging`, `code-review`, `testing-strategies`, or `performance-optimization` should own the next step.
Read [references/safe-refactor-checklist.md](references/safe-refactor-checklist.md) before large or risky cleanup passes.

## When to use this skill
- Simplifying a complex function, component, service, script, or system boundary without changing intended behavior
- Removing duplication or collapsing copy-paste variants into one clearer abstraction
- Renaming confusing concepts, splitting modules, or reorganizing code for readability and maintainability
- Separating mechanical cleanup from semantic feature work so the diff is easier to review
- Preparing or designing a repeated migration, codemod, or API replacement across many files
- Cleaning up legacy code before adding a feature when the structure itself is the blocker
- Converting an ad hoc cleanup request into a safer, staged refactor plan

## When not to use this skill
- **Root-cause diagnosis, regression isolation, flaky failure investigation, or proving why a bug exists** → use `debugging`
- **Approving, blocking, or commenting on a PR / diff as a reviewer** → use `code-review`
- **Choosing organization-wide validation depth, test layers, or merge/release gate policy** → use `testing-strategies`
- **Profiling, benchmark interpretation, performance budgeting, or tuning tradeoffs** → use `performance-optimization`
- **Pure search/navigation work where the next step is just finding symbols, call sites, or files** → use `codebase-search`

## Instructions

### Step 1: Frame the refactor before editing
Capture the structural problem in one sentence.

Useful prompts:
- What is messy or expensive to work with right now?
- What should stay behaviorally the same after the cleanup?
- What boundary is changing: function, component, module, API adapter, test helper, config surface, or repo-wide pattern?
- What evidence already exists: tests, screenshots, typecheck, fixtures, logs, benchmarks, or user-facing examples?
- Is this a one-file cleanup or a repeated migration pattern?

Refactor frame:
```markdown
Problem: checkout handler mixes validation, pricing, inventory, and persistence in one file.
Behavior to preserve: existing coupon, tax, and out-of-stock behavior.
Scope: service-layer cleanup in one package.
Evidence: unit tests exist; integration suite is slow but available.
Refactor type: local decomposition.
```

If the user mostly needs to prove the current behavior or isolate a failure first, route to `debugging`.

### Step 2: Choose the refactor mode
Pick one mode before writing a plan.

**Mode A — Local safe refactor**
Use for one file or one narrow module.
Typical moves:
- rename for clarity
- extract function / helper / component
- move logic behind a clearer boundary
- remove duplication between close variants
- split orchestration from pure logic

**Mode B — Behavior freeze first**
Use when the code is fragile, poorly understood, or lightly tested.
Typical moves:
- add characterization tests or fixtures first
- capture current outputs / API responses / screenshots
- shrink the reproduction surface before broad cleanup
- postpone large structural edits until safety signals exist

**Mode C — Repetitive migration / codemod**
Use when the same change repeats across many files.
Typical moves:
- define the pattern being replaced
- decide whether search-and-replace, structural rewrite, or AST/codemod tooling fits
- test on a small sample before repo-wide rollout
- split mechanical migration commits from semantic fixes

Quick selector:
| Signal | Mode |
|---|---|
| One complex function/component, tests exist, narrow scope | Local safe refactor |
| Legacy area, hidden invariants, weak confidence | Behavior freeze first |
| Same API / naming / structure repeated across many files | Repetitive migration / codemod |

### Step 3: Define the behavior-preservation guardrail
Before the main cleanup, decide how you will prove you did not break intent.

Use one or more of:
- existing unit / integration / end-to-end tests
- typecheck and linter
- characterization tests for legacy code
- fixture snapshots or golden outputs
- screenshots / preview capture for UI behavior
- a before/after sample input-output table
- manual smoke steps when automation is thin

Minimum rule:
- **Small local refactor** → at least one fast verification path
- **Risky legacy cleanup** → freeze behavior first
- **Repo-wide migration** → pilot on a subset and verify before expansion

If the user needs help deciding the whole test program rather than verifying one refactor, route to `testing-strategies`.

### Step 4: Make the change in reviewable slices
Do not mix every cleanup impulse into one huge diff.

Preferred slicing:
1. mechanical rename / move / extract work
2. cleanup of duplicated or dead code
3. semantic improvement only if still needed
4. follow-up verification or docs/comments update

Good patterns:
- keep structural and behavioral changes separate when possible
- isolate generated or bulk-migration edits from hand-tuned fixes
- leave notes about known-risk edges and untouched hotspots
- prefer a sequence of boring diffs over one heroic rewrite

### Step 5: Use the right refactor tactics for the mode

#### For local safe refactors
Favor simple, low-surprise moves:
- rename unclear symbols to domain names
- extract pure computation from orchestration
- split branching logic into named helpers
- replace duplicate condition trees with one shared path
- move side effects to the edges of the flow

Questions:
- Did naming get clearer?
- Did the module gain one obvious responsibility?
- Did the call graph become easier to follow?
- Did we reduce branching / duplication without inventing new abstraction for its own sake?

#### For behavior-freeze-first refactors
Slow down and lock current behavior first.

Useful sequence:
1. capture current failing-or-working examples
2. write or preserve regression checks
3. identify the smallest safe seam
4. refactor behind that seam
5. compare before/after behavior directly

If the code still feels mysterious after step 2, route the investigation part to `debugging` before continuing.

#### For repetitive migration / codemod work
Treat this as automation design, not manual cleanup at scale.

Capture:
- source pattern
- target pattern
- known exceptions
- languages / folders affected
- docs/config/tests that must change with the code
- rollback plan if the migration partially fails

Preferred loop:
1. test the transform on a tiny representative sample
2. inspect the diff for false positives / misses
3. expand to the real scope only after that sample is trustworthy
4. verify with tests, typecheck, search, and targeted review

If the user mainly needs raw repo search, symbol inventory, or impact mapping before choosing a transform, route that discovery work to `codebase-search`.

### Step 6: Verify and write the handoff
Do not stop at "looks cleaner."

Verification brief:
```markdown
Refactor mode: Local safe refactor
Behavior guardrail: existing unit tests + typecheck
Changes made: split price calculation, inventory validation, and persistence into named helpers
Risky edges checked: coupon rounding, empty-cart validation
Still not addressed: broader order-state redesign
```

Always call out:
- what behavior was intended to stay the same
- what evidence was used to verify that
- what future cleanup still remains
- whether another skill should own the next step

## Output format
Use this structure when the user wants a concrete refactor plan or summary:

```markdown
## Refactor frame
- Problem:
- Behavior to preserve:
- Scope:
- Evidence available:
- Chosen mode:

## Planned changes
1.
2.
3.

## Verification
- Fast checks:
- Higher-risk checks:

## Route-outs
- Use `debugging` for:
- Use `code-review` for:
- Use `testing-strategies` for:
- Use `performance-optimization` for:
```

## Examples

### Example 1: Oversized service handler
**Input:** "Refactor this 180-line checkout handler into something readable without changing behavior."

**Good response shape:**
- choose **Local safe refactor**
- preserve coupon/tax/out-of-stock behavior explicitly
- extract validation, pricing, and persistence helpers
- keep tests/typecheck as guardrails
- split structural cleanup from any semantic fixes

### Example 2: Fragile legacy module
**Input:** "This reporting service is impossible to maintain, but we barely trust the tests."

**Good response shape:**
- choose **Behavior freeze first**
- capture characterization cases before broad cleanup
- identify one seam at a time instead of redesigning everything
- route deep failure investigation to `debugging` if expected behavior is still unclear

### Example 3: Repeated API migration
**Input:** "We need to replace a deprecated client API across 220 TypeScript files before the framework upgrade."

**Good response shape:**
- choose **Repetitive migration / codemod**
- define source and target patterns
- pilot the transform on a subset first
- keep mechanical rewrite separate from semantic follow-up
- verify with tests, typecheck, and repo search

## Best practices
1. Pick one refactor mode before proposing actions.
2. Make behavior-preservation explicit; do not assume it.
3. Prefer small, reviewable slices over one giant cleanup diff.
4. Use codemods only when repetition justifies the setup cost.
5. Keep structural cleanup and semantic behavior changes separate when possible.
6. Route bug diagnosis, review judgment, test-program design, and performance tuning to neighboring skills instead of absorbing them.
7. Preserve evidence of what was verified and what still remains risky.

## References
- [Refactor modes](references/refactor-modes.md)
- [Handoff boundaries](references/handoff-boundaries.md)
- [Safe refactor checklist](references/safe-refactor-checklist.md)
- [Martin Fowler — Refactoring](https://martinfowler.com/books/refactoring.html)
- [VS Code refactoring docs](https://code.visualstudio.com/docs/editor/refactoring)
- [IntelliJ IDEA refactoring docs](https://www.jetbrains.com/help/idea/refactoring-source-code.html)
- [OpenRewrite docs](https://docs.openrewrite.org/)
- [jscodeshift](https://github.com/facebook/jscodeshift)
- [ast-grep](https://ast-grep.github.io/)
