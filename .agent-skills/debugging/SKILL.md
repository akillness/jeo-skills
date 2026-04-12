---
name: debugging
description: >
  Debug code, runtime behavior, regressions, flaky failures, and code-adjacent
  incidents with a systematic reproduce → isolate → hypothesize → verify loop.
  Use when the user has moved past raw symptom triage and now needs to narrow the
  failing boundary, confirm what changed, design a safe fix, or prove a fix with
  regression coverage. Triggers on: reproduce the bug, isolate the regression,
  flaky test investigation, git bisect, why does this code behave like this, and
  root-cause debugging after the important log lines are already known. Route
  raw symptom-first log triage to `log-analysis`.
allowed-tools: Read Grep Glob Bash Write
compatibility: >
  Best for code-level and behavior-level debugging across CLI, backend, frontend,
  fullstack, and CI workflows. Not for observability-platform setup, pure PR
  review, or broad testing-strategy design.
metadata:
  tags: debugging, regression-isolation, reproduction, flaky-tests, git-bisect, root-cause
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Debugging

Use this skill to turn a vague bug report or narrowed symptom into a bounded root-cause workflow.

The job is **not** to jump straight into patching.
The job is to:
1. define the failing behavior clearly,
2. reproduce it reliably,
3. isolate the smallest failing boundary,
4. test the most plausible hypotheses,
5. verify the fix and add a regression guard.

Read [references/debug-loop.md](references/debug-loop.md) before handling unfamiliar failure modes.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `debugging`, `log-analysis`, `testing-strategies`, `code-review`, or `performance-optimization` should own the request.

## When to use this skill
- Runtime bugs, regressions, or incorrect behavior where code or configuration boundaries are now the main suspect
- Flaky or intermittent failures that need reproduction, narrowing, and stabilization
- CI/test failures after the first actionable error has already been identified
- Frontend/backend/fullstack bugs that require correlating a symptom with recent code, state, or config changes
- Cases where the user asks how to reproduce, isolate, bisect, fix, or verify a bug
- Cases where the next step is a safe debugging plan rather than a raw log summary

## When not to use this skill
- **Raw symptom-first log triage** where the user mainly needs to know which lines matter → use `log-analysis`
- **Observability stack setup, dashboards, alerting, tracing rollout, or instrumentation platform design** → use `monitoring-observability`
- **Broad test-program design, test pyramid planning, or organization-wide coverage policy** → use `testing-strategies`
- **Pull request review or preventive audit of code quality/security/test coverage** → use `code-review`
- **Performance tuning where the core task is measurement, profiling, and optimization tradeoffs rather than general bug isolation** → use `performance-optimization`

## Instructions

### Step 1: Frame the failure precisely
Before changing anything, write the bug down in a form that can be tested.

Capture:
- expected behavior
- actual behavior
- exact trigger/input/state
- environment: local / CI / staging / production / browser / mobile
- whether this is deterministic, flaky, or unknown
- whether it is a regression and what "last known good" state exists

Good frame:
```markdown
Expected: saving profile keeps the existing avatar when no new file is uploaded.
Actual: avatar becomes null after save.
Trigger: edit profile form with no avatar file attached.
Environment: staging + local
Regression: started after last week's profile form refactor.
```

If the problem statement is still only "something failed" and the main evidence is logs, route back to `log-analysis` first.

### Step 2: Build the smallest reliable reproduction
Prefer the cheapest reproduction that still fails.

Common forms:
- a single CLI command
- one HTTP request or API call
- one UI flow with exact steps
- one failing test or fixture
- one data row / payload / config combination
- one commit range for regression hunting

Useful tactics:
- strip unrelated setup
- reduce input size
- freeze randomness, time, and network dependencies when possible
- note whether the failure rate is 100%, intermittent, or environment-specific
- if the bug is flaky, gather a repeated-run loop before claiming a cause

Examples:
```bash
# Repeat a flaky test with visible failures
pytest tests/test_checkout.py -k coupon --maxfail=1 -vv
pytest tests/test_checkout.py -k coupon -vv --lf

# Re-run a specific JS test file
npm test -- checkout.test.ts

# Recreate a failing request
curl -i -X POST http://localhost:3000/api/profile -H 'Content-Type: application/json' -d '{"avatar":null}'
```

### Step 3: Isolate the failing boundary
Narrow the problem before proposing fixes.

Isolation methods:
1. **Boundary isolation** — UI vs API vs DB vs worker vs config vs dependency
2. **Input isolation** — one payload/fixture/user/record that triggers the bug
3. **History isolation** — what changed between known good and bad states
4. **Environment isolation** — local vs CI vs staging vs production
5. **Timing/isolation for flaky failures** — concurrency, retries, caching, order dependence, clock/timezone, random seeds

High-value questions:
- Can one file/module/function now be named as the primary suspect?
- Is the failure caused by data shape, state transition, config drift, or a code path?
- Did a recent dependency, flag, schema, or deployment change alter behavior?

Useful commands:
```bash
# Compare recent changes
git log --oneline -15

git diff HEAD~5 -- path/to/suspect

# Regression isolation when a known good commit exists
git bisect start
git bisect bad
git bisect good <known-good-commit>

# Search the codebase for the suspect branch or error text
rg -n "avatar|null|profile" src tests
```

### Step 4: Form hypotheses and run the smallest discriminating check
Do not change five things at once.

For each hypothesis:
- state why it explains the failure
- run one check that can falsify it
- record the result
- keep/reject the hypothesis based on evidence

Examples:
```markdown
Hypothesis A: the serializer now clears `avatar` when the field is absent.
Check: inspect request payload + serializer update path + one focused unit test.

Hypothesis B: staging only fails because a feature flag enables a new validation rule.
Check: compare local/staging flag state and rerun the same request.
```

Prefer read-only or reversible checks first:
- inspect payloads, config, and recent diffs
- add temporary logging/assertions only at the narrowed boundary
- rerun one focused test instead of the whole suite
- compare one known-good and one known-bad state

### Step 5: Handle common debugging modes explicitly
Choose the mode that matches the evidence.

**Regression debugging**
- identify last known good
- compare code/config/dependency/flag changes
- use `git bisect` if a reliable pass/fail check exists

**Flaky failure debugging**
- measure frequency first
- control randomness, time, async waits, ordering, and shared state
- separate product bug vs test bug vs environment instability
- if the main job becomes suite design or flake-prevention policy, route to `testing-strategies`

**Config / environment debugging**
- compare env vars, flags, dependency versions, runtime versions, and data assumptions
- if the real task is broad env-file or machine reproducibility design, route to `system-environment-setup`

**Symptom from logs, cause in code**
- take the first actionable failure from `log-analysis`
- map it to the suspect code path, request boundary, or config branch
- stay in `debugging` only after the symptom is narrowed enough to test hypotheses

### Step 6: Fix the cause, then prove it
A good debugging result includes evidence that the fix addresses the cause rather than silencing the symptom.

Verification checklist:
- the reproducer now passes
- nearby edge cases still behave correctly
- a regression test or equivalent guard exists
- the explanation matches the observed failure
- the fix scope is as small as practical

Useful outputs:
```markdown
# Debugging Brief

## Failure definition
- Expected: ...
- Actual: ...
- Reproducer: ...
- Confidence: high | medium | low

## Isolation result
- Narrowed boundary: ...
- Last known good / recent change: ...

## Likely root cause
- 1-3 sentences grounded in evidence

## Evidence
- Reproducer output / failing test / diff / config comparison

## Fix direction
1. ...
2. ...
3. ...

## Verification
- Reproducer rerun: ...
- Regression guard: ...

## Handoff
- Stay in `debugging` | route next to `testing-strategies` | route next to `code-review` | route next to `performance-optimization`
```

### Step 7: Escalate carefully when evidence is weak
If you cannot reproduce or isolate yet:
1. Say confidence is low.
2. Ask for the smallest missing artifact only: failing command, payload, test, commit range, environment diff, or first actionable log excerpt.
3. Do not claim a root cause from a symptom-only report.
4. Prefer one more discriminating check over speculative patching.

## Output format
Always return a concise debugging brief or debugging plan.

Required qualities:
- state the failure in testable terms
- identify the narrowest current suspect boundary
- separate symptom evidence from root-cause evidence
- prefer reversible checks before broad edits
- name the right handoff skill when the task has shifted
- include fix verification, not just fix ideas

## Examples

### Example 1: Regression after a refactor
**Input**
> Saving a profile without uploading a new avatar now clears the existing avatar. It used to work before the form refactor.

**Output sketch**
- Failure definition: avatar preserved before, now becomes null when no file is uploaded
- Reproducer: submit edit form with no avatar file
- Isolation result: suspect serializer/update path introduced in recent refactor
- Likely root cause: absent field and explicit null are being treated the same
- Checks: compare payload before/after refactor, inspect update branch, add focused regression test
- Handoff: stay in `debugging`, then route to `testing-strategies` for broader form regression coverage if needed

### Example 2: Flaky CI test
**Input**
> This checkout test passes locally but fails in CI about 1 in 8 runs.

**Output sketch**
- Failure definition: nondeterministic CI failure in checkout test
- Isolation result: likely timing/shared-state/order-dependence issue
- Checks: rerun failing test repeatedly, inspect fixtures/shared state, control clocks/randomness, compare CI-only env differences
- Likely root cause: shared cached state leaks between tests
- Verification: focused repeated-run loop becomes stable after fixture cleanup
- Handoff: route to `testing-strategies` only if the next job is broader flake-prevention policy

### Example 3: Symptom-only report from logs
**Input**
> Here are 500 lines of stack traces and retries. Can you debug this?

**Output sketch**
- First move: route to `log-analysis` to identify the first actionable failure and blast radius
- Reason: the request is still symptom-first; debugging begins after the meaningful failure has been narrowed

## Best practices
1. **Reproduce before patching** — an unproven fix is just a guess.
2. **Minimize aggressively** — smaller repros produce faster, safer reasoning.
3. **Compare good vs bad states** — regressions are often faster to isolate than to intuit.
4. **Change one thing at a time** — debugging is an experiment loop, not a rewrite contest.
5. **Treat flaky failures as a mode, not a footnote** — frequency, timing, and shared state matter.
6. **Keep symptom triage and root-cause workflow separate** — use `log-analysis` first when the important line is still unknown.
7. **End with verification** — every debugging result should say how the cause was confirmed.

## References
- [Visual Studio Code: Debugging](https://code.visualstudio.com/docs/editor/debugging)
- [Git: git-bisect documentation](https://git-scm.com/docs/git-bisect)
- [pytest: Flaky tests](https://docs.pytest.org/en/stable/explanation/flaky.html)
- [Google SRE: Troubleshooting Methodology](https://sre.google/sre-book/effective-troubleshooting/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [The Debugging Book](https://www.debuggingbook.org/)
