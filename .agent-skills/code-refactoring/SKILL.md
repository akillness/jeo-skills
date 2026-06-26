---
name: code-refactoring
description: ">"
compatibility: ">"
allowed-tools: Read Grep Glob Bash Write
metadata:
  tags: refactoring, code-quality, behavior-preservation, cleanup, codemod, migration, technical-debt, legacy-code
  platforms: Claude, ChatGPT, Gemini, Codex
  version: 2.1
  source: akillness/jeo-skills
  modernization: 2026-04-14
  hardening: 2026-04-18
---






# Code Refactoring

Use this skill when the job is to **improve structure without changing intended behavior**.

The center of the skill should stay small and repeatable:
1. identify the cleanup packet you actually have,
2. choose one refactor mode,
3. make the behavior guardrail explicit,
4. stage the work in reviewable slices,
5. verify and route remaining work honestly.

Read these support docs before handling unfamiliar cleanup work:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/refactor-modes.md](references/refactor-modes.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)
- [references/safe-refactor-checklist.md](references/safe-refactor-checklist.md)

## When to use this skill
- A function, component, service, script, or module is too tangled and needs structural cleanup without a behavior change.
- A legacy area needs a **freeze-first** cleanup because the current behavior is fragile or poorly understood.
- The same API, naming, or structure change repeats across many files and needs a codemod / migration brief.
- A diff mixes cleanup with too much semantic work and needs to be split into smaller reviewable slices.
- The user asks to refactor, decompose, deduplicate, rename safely, stage a cleanup, or plan a behavior-preserving migration.

## When not to use this skill
- **The main job is proving why behavior is wrong, reproducing a failure, or isolating a regression** → `debugging`
- **The main job is deciding whether a concrete diff / PR is safe to merge** → `code-review`
- **The main job is choosing org-wide validation depth, benchmark policy, or release gates** → `testing-strategies`
- **The main job is finding the bottleneck from traces, flamegraphs, CWV reports, or profiler output** → `performance-optimization`
- **The main job is finding symbols, call sites, or impact scope before any cleanup tactic is chosen** → `codebase-search`

## Instructions

### Step 1: Start from the cleanup packet
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Choose the packet the user already has:
- one messy file / component / service
- a fragile legacy area with weak confidence in current behavior
- a repeated migration pattern across many files
- a cleanup-heavy diff that needs reshaping before review
- only a vague desire to “find all the places first”

Output the intake briefly:

```markdown
## Cleanup Packet
- Current artifact:
- Why it is enough (or not enough):
- Missing evidence to collect next:
```

Rule: do not force a giant refactor plan when the immediate need is only search, diagnosis, review, or performance evidence.

### Step 2: Choose one primary refactor mode
Pick exactly one primary mode from [references/refactor-modes.md](references/refactor-modes.md).

Primary modes:
- `local-safe-refactor`
- `behavior-freeze-first`
- `repetitive-migration-codemod`
- `diff-shaping-cleanup`

Quick selector:
| Signal | Mode |
|---|---|
| One file or narrow module, clear intent, at least one fast guardrail exists | `local-safe-refactor` |
| Fragile legacy area, hidden invariants, weak test trust | `behavior-freeze-first` |
| Same API or structure repeats across many files | `repetitive-migration-codemod` |
| Cleanup is mixed into a risky review diff and needs smaller slices | `diff-shaping-cleanup` |

Rule: one primary mode, optional secondary note. Do not mix every cleanup tactic into one answer.

### Step 3: Freeze the behavior guardrail
Before broad edits, decide how you will prove intent stayed the same.

Guardrail sources can include:
- existing unit / integration / end-to-end tests
- typecheck and linter
- characterization tests or captured examples
- fixture snapshots or golden outputs
- screenshots / preview captures for UI work
- before/after sample input-output tables
- manual smoke steps when automation is thin

Minimum rule:
- **Local cleanup** → at least one fast verification path
- **Fragile legacy cleanup** → freeze behavior first
- **Repeated migration** → pilot on a small representative sample first
- **Diff reshaping** → separate mechanical cleanup from semantic follow-up

If the user mainly needs help designing the entire validation program, route to `testing-strategies`.

### Step 4: Build the smallest credible cleanup plan
Keep the plan reviewable.

Preferred slices:
1. rename / move / extract work
2. duplicated or dead-code cleanup
3. mechanical migration or codemod rollout
4. semantic follow-up only if still needed
5. verification + handoff

For each slice, capture:
- goal
- behavior to preserve
- evidence / guardrail
- risk edge
- whether another skill owns the next step

Rules:
- Prefer a sequence of boring diffs over one heroic rewrite.
- Keep structural cleanup and semantic behavior changes separate when possible.
- For migrations, define source pattern, target pattern, known exceptions, and rollback path before scaling up.

### Step 5: Use the right mode packet
Use the matching packet in [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md):
- local cleanup packet
- fragile legacy / freeze-first packet
- repeated migration / codemod packet
- diff-shaping packet

Good moves by mode:
- `local-safe-refactor` → rename unclear concepts, extract pure logic, move side effects to edges, collapse close duplication
- `behavior-freeze-first` → capture examples, add characterization tests, identify one seam, refactor behind that seam
- `repetitive-migration-codemod` → define source/target pattern, sample first, inspect false positives, expand only after the pilot is trustworthy
- `diff-shaping-cleanup` → split cleanup from semantic changes, isolate generated or mechanical edits, leave review notes about remaining hotspots

### Step 6: Verify and route remaining work
Do not stop at “looks cleaner.”

Verification brief:
```markdown
## Refactor Brief
- Primary mode:
- Behavior to preserve:
- Guardrail used:
- Smallest planned slices:
- Risks still open:
- Recommended next move:
```

Always call out:
- what behavior was intended to stay the same
- what evidence was used to verify that
- what still remains risky or out of scope
- which neighboring skill should own the next step when the job shifts

## Output format

```markdown
## Cleanup Packet
- Current artifact:
- Primary mode:
- Why this mode fits:

## Behavior Guardrail
- Intended behavior to preserve:
- Evidence available:
- Missing evidence:

## Planned slices
1. ...
2. ...
3. ...

## Verification
- Fast checks:
- Higher-risk checks:

## Route-outs
- Use `debugging` for:
- Use `code-review` for:
- Use `testing-strategies` for:
- Use `performance-optimization` for:
- Use `codebase-search` for:
```

## Examples

### Example 1: Oversized service handler
**Input:** "Refactor this 180-line checkout handler into something readable without changing behavior."

**Good response shape:**
- choose `local-safe-refactor`
- preserve coupon / tax / out-of-stock behavior explicitly
- extract validation, pricing, and persistence helpers
- keep tests / typecheck as guardrails
- split structural cleanup from later semantic follow-up

### Example 2: Fragile legacy module
**Input:** "This reporting service is impossible to maintain, but we barely trust the tests. Help me refactor it safely."

**Good response shape:**
- choose `behavior-freeze-first`
- capture characterization cases before broad cleanup
- identify one seam at a time instead of redesigning everything
- route deep failure investigation to `debugging` if expected behavior is still unclear

### Example 3: Repeated API migration
**Input:** "We need to replace a deprecated client API across 220 TypeScript files before the framework upgrade."

**Good response shape:**
- choose `repetitive-migration-codemod`
- define source and target patterns
- pilot the transform on a subset first
- keep mechanical rewrite separate from semantic follow-up
- verify with tests, typecheck, and repo search

### Example 4: Search-first route-out
**Input:** "Before we refactor anything, find every call site and wrapper around this old helper so we can see the blast radius."

**Good response shape:**
- route the primary task to `codebase-search`
- do not present a full refactor plan as the main answer
- keep `code-refactoring` positioned as the cleanup lane after the impact map exists

## Best practices
1. Start from the packet the user actually has, not an idealized cleanup workflow.
2. Pick one primary mode before proposing actions.
3. Make behavior preservation explicit; do not assume it.
4. Prefer small, reviewable slices over one giant cleanup diff.
5. Use codemods or structural rewrites only when repetition justifies the setup cost.
6. Keep diagnosis, review judgment, test-policy design, performance tuning, and symbol inventory routed to neighboring skills instead of absorbing them.
7. Preserve evidence of what was verified and what still remains risky.

## References
- [Intake packets and route-outs](references/intake-packets-and-route-outs.md)
- [Refactor modes](references/refactor-modes.md)
- [Handoff boundaries](references/handoff-boundaries.md)
- [Safe refactor checklist](references/safe-refactor-checklist.md)
- [Martin Fowler — Refactoring](https://martinfowler.com/books/refactoring.html)
- [VS Code refactoring docs](https://code.visualstudio.com/docs/editor/refactoring)
- [IntelliJ IDEA refactoring docs](https://www.jetbrains.com/help/idea/refactoring-source-code.html)
- [OpenRewrite docs](https://docs.openrewrite.org/)
- [jscodeshift](https://github.com/facebook/jscodeshift)
- [ast-grep](https://ast-grep.github.io/)
