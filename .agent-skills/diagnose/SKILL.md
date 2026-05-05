---
name: diagnose
description: Use this skill when >
  Systematic six-phase debugging methodology: build a fast feedback loop, reproduce
  the failure, hypothesize, instrument, fix with regression tests, then clean up.
  Use when investigating hard bugs, performance regressions, or flaky failures where
  investing in a reliable feedback loop first will make subsequent phases mechanical.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works across CLI, backend, frontend, fullstack, and CI environments. Complements
  debugging (which focuses on reproduce→isolate) by adding explicit feedback-loop
  investment as Phase 1. Use debugging for quick targeted fixes; use diagnose for
  systematic investigation of hard or recurring problems.
metadata:
  tags: debugging, feedback-loop, reproduction, hypothesis, instrumentation, post-mortem
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Diagnose

A six-phase loop for systematic bug investigation. The key insight: **invest disproportionate effort in Phase 1**. With a reliable feedback loop, phases 2–6 become mechanical.

## When to use this skill

- Hard bugs that resist quick fixes
- Performance regressions with unclear root cause
- Flaky failures that need repeated-run evidence
- Any failure where previous fix attempts failed

## When not to use this skill

- Quick targeted fixes with obvious root cause → use `debugging`
- Symptom-first log triage → use `log-analysis`
- Broad test-policy design → use `testing-strategies`

## The Six Phases

### Phase 1 — Build a feedback loop (invest here first)

Create a fast, deterministic, automated pass/fail signal for the bug.

```
Goal: < 10 second feedback cycle
Signal: automated pass/fail, not manual inspection
Determinism: same input → same result every time
```

Ask yourself: "Can I run one command and know within 10 seconds if the bug is present?"

- Write a failing test if one doesn't exist
- Create a minimal reproduction script
- Isolate the trigger to the smallest possible input
- Make the failure obvious and observable

**Do not proceed to Phase 2 until the feedback loop is reliable.**

### Phase 2 — Reproduce

Confirm the failure is reproducible under controlled conditions.

- Run the feedback loop multiple times to confirm determinism
- Document exact inputs, environment, and steps
- Identify if this is new behavior (regression) or always-broken

### Phase 3 — Hypothesize

Form ranked hypotheses about root cause.

- List 2–4 candidate causes ordered by likelihood
- Each hypothesis must be falsifiable
- Start with the most likely, not the most interesting

```markdown
H1 (most likely): [specific cause]
H2: [alternative cause]
H3: [edge case cause]
```

### Phase 4 — Instrument

Run one discriminating check per hypothesis.

- Add logging, assertions, or breakpoints at the narrowest useful point
- Use the feedback loop to test each hypothesis quickly
- Record evidence: confirmed / refuted / inconclusive
- Move to the next hypothesis when one is refuted

### Phase 5 — Fix and test

Apply the fix and verify it closes the loop.

- Write the regression test before the fix (if possible)
- Apply the minimal change that addresses root cause
- Run the full test suite, not just the target test
- Confirm the feedback loop now passes

### Phase 6 — Cleanup and post-mortem

- Remove diagnostic instrumentation
- Document what the root cause was and why it was surprising
- Identify if similar patterns exist elsewhere in the codebase
- Consider whether a preventive check (lint rule, test, assertion) would catch this class of bug automatically

## Quick reference

```bash
# Phase 1: make the feedback loop
# Write a failing test or minimal repro script

# Phase 4: instrument at the narrowest point
console.error('[diagnose] value at boundary:', value)

# Phase 5: verify fix closes the loop
npm test -- --testPathPattern=failing-test
```

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
