---
name: debugging
description: ">"
compatibility: ">"
allowed-tools: Read Grep Glob Bash Write
metadata:
  tags: debugging, regression-isolation, reproduction, flaky-tests, git-bisect, root-cause
  platforms: Claude, ChatGPT, Gemini, Codex
  version: 2.1
  source: akillness/jeo-skills
---






# Debugging

Use this skill when the job is to **turn a concrete failure into a bounded diagnosis loop**.

The center of the skill is small and repeatable:
1. define the failing behavior in testable terms,
2. build or confirm the cheapest reliable reproducer,
3. isolate the narrowest failing boundary,
4. run one discriminating check per hypothesis,
5. verify the fix under the same conditions.

Read [references/handoff-boundaries.md](references/handoff-boundaries.md) before taking work that may belong to `log-analysis`, `testing-strategies`, `code-review`, or `performance-optimization`.
Read [references/debug-loop.md](references/debug-loop.md) for the full experiment-loop scaffolding.
Read [references/mode-selection-and-fast-checks.md](references/mode-selection-and-fast-checks.md) when the case is clearly a regression, flake, env/config mismatch, or artifact-led investigation.

## When to use this skill
- A command, test, request, or UI flow fails and the user needs a root-cause workflow
- A bug is reproducible or close to reproducible and needs narrowing before patching
- A regression has a likely change window or last-known-good state
- A flaky failure needs repeated-run evidence, isolation, and stabilization of one concrete case
- CI/staging/prod-only behavior now has enough evidence to compare environment or config differences
- The user asks how to reproduce, isolate, bisect, confirm, or verify a bug fix

## When not to use this skill
- **The user only has logs / stack traces and still needs the first actionable failure** → use `log-analysis`
- **The real task is test-program design, flake policy, or coverage planning** → use `testing-strategies`
- **The task is reviewing a diff / PR for correctness, risk, or missing evidence** → use `code-review`
- **The main job is telemetry rollout, dashboards, or observability-platform design** → use `monitoring-observability`
- **The main job is bottleneck measurement and optimization tradeoffs** → use `performance-optimization`

## Instructions

### Step 1: Freeze the failure definition
Write the failure in a form that can be retested.

Capture:
- expected behavior
- actual behavior
- exact trigger, input, or state
- environment: local / CI / staging / production / browser / mobile / runtime
- deterministic vs flaky vs unknown
- last-known-good state if this may be a regression

Minimum shape:
```markdown
Expected: ...
Actual: ...
Trigger: ...
Environment: ...
Confidence: high | medium | low
```

If the report is still just "something failed" with giant logs and no narrowed symptom, route to `log-analysis` first.

### Step 2: Choose the right first evidence source
Pick the cheapest path that can falsify or confirm your next hypothesis.

Use this routing shortcut:
- **Known failing command/test/request/UI flow** → reproduce it directly
- **Regression with last-known-good** → compare recent changes and consider `git bisect`
- **Flaky / intermittent** → measure frequency first with repeated runs
- **CI/staging/prod only** → compare env/config/runtime facts before speculating about code
- **Artifact-led case** → inspect the first meaningful log/trace/screenshot, then narrow to one suspect boundary
- **Performance-only complaint** → route to `performance-optimization` unless a concrete broken behavior still needs diagnosis

### Step 3: Build the smallest reliable reproducer
Prefer the cheapest reproduction that still fails.

Common shapes:
- one CLI command
- one HTTP request or API call
- one UI flow with exact steps
- one failing test or fixture
- one save file / seed / payload / config combination
- one commit range for regression hunting

Useful tactics:
- reduce unrelated setup
- freeze time/randomness/network when possible
- capture exact env/config values that differ
- keep repeated-run loops focused on one suspect

### Step 4: Isolate the boundary before proposing fixes
Narrow the problem first.

Isolation angles:
1. boundary — UI vs API vs DB vs worker vs config vs dependency vs asset/runtime
2. input — one payload, record, seed, scene, or fixture
3. history — what changed between good and bad
4. environment — local vs CI vs staging vs production
5. timing — ordering, retries, caching, clocks, async waits, shared state

High-value questions:
- Can one file/module/config branch now be named as the primary suspect?
- Is the failure about data shape, state transition, config drift, dependency behavior, or code path?
- Is the current bottleneck still diagnosis, or has the task shifted to review / test-policy / optimization work?

### Step 5: Run one discriminating check per hypothesis
Do not patch five things at once.

For each hypothesis:
- state why it explains the failure
- run one read-only or reversible check first
- record the result
- keep or reject the hypothesis based on evidence

Good first checks:
- inspect the request/payload/config at the narrowed boundary
- compare one good state and one bad state
- rerun one targeted test instead of the whole suite
- diff the suspect commit range
- add temporary instrumentation only at the narrowed boundary

### Step 6: Use the right mode packet
Once the case type is clear, follow the matching packet in [references/mode-selection-and-fast-checks.md](references/mode-selection-and-fast-checks.md):
- regression debugging
- flaky-failure debugging
- env/config mismatch debugging
- artifact-led debugging after log/trace/screenshot triage
- runtime / browser / game-loop debugging

### Step 7: Fix the cause, then prove it
A good debugging result shows that the cause was addressed, not just the symptom muted.

Verification checklist:
- the reproducer now passes
- nearby edge cases still behave correctly
- a regression guard exists when practical
- the explanation matches the observed failure
- the fix scope is smaller than the search space you started with

### Step 8: Escalate honestly when evidence is still weak
If reproduction or isolation still fails:
1. say confidence is low,
2. ask for the smallest missing artifact only,
3. avoid pretending the root cause is known,
4. prefer one more discriminating check over speculative patching.

## Output format
Always return a concise debugging brief or debugging plan.

```markdown
# Debugging Brief

## Failure definition
- Expected: ...
- Actual: ...
- Reproducer: ...
- Confidence: high | medium | low

## Isolation result
- Narrowed boundary: ...
- Recent change / env difference / artifact clue: ...

## Hypotheses and checks
1. Hypothesis: ...
   - Check: ...
   - Result: ...

## Likely root cause
- 1-3 sentences grounded in evidence

## Fix direction
1. ...
2. ...

## Verification
- Reproducer rerun: ...
- Regression guard: ...

## Handoff
- Stay in `debugging` | route to `log-analysis` | route to `testing-strategies` | route to `code-review` | route to `performance-optimization`
```

## Examples

### Example 1: Regression after a refactor
**Input**
> Saving a profile without uploading a new avatar now clears the existing avatar. It worked before the refactor.

**Output sketch**
- Define expected vs actual behavior in one reproducible form submission
- Compare the update path before/after the refactor
- Check whether absent field and explicit null are treated the same
- Verify with a focused regression test and rerun of the original flow

### Example 2: Flaky CI failure
**Input**
> This checkout test passes locally but fails in CI about one in eight runs.

**Output sketch**
- Mark the case as flaky, not deterministic
- Run a repeated-run loop and compare timing/shared-state/env differences
- Inspect only the failing test and nearby fixtures first
- Route to `testing-strategies` only if the job expands into suite-wide flake policy

### Example 3: Prod-only behavior with artifact clue
**Input**
> The job only fails in staging. I have the first failing request payload and the config diff.

**Output sketch**
- Treat this as env/config mismatch debugging
- Compare staging vs local/runtime facts before patching code
- Narrow to the one flag/version/secret branch that changes behavior
- Verify with the same payload under the corrected config

### Example 4: Symptom-only log dump
**Input**
> Here are 500 lines of retries and stack traces. Can you debug this?

**Output sketch**
- Route first to `log-analysis`
- State that the first actionable failure still needs narrowing
- Do not pretend a root-cause loop can start yet

## Best practices
1. **Reproduce before patching** — unproven fixes are guesses.
2. **Use the cheapest evidence source first** — direct repro, repeated run, env diff, or artifact clue.
3. **Keep mode selection explicit** — regression, flake, env/config, artifact-led, and runtime cases need different first checks.
4. **Separate symptom triage from diagnosis** — logs help you start, not finish.
5. **Change one thing at a time** — debugging is an experiment loop.
6. **End with verification** — every result should say how the cause was confirmed.

## References
- [Visual Studio Code: Debugging](https://code.visualstudio.com/docs/debugtest/debugging)
- [Playwright: Debugging Tests](https://playwright.dev/docs/debug)
- [GitHub Docs: Enabling debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging)
- [Git: git-bisect documentation](https://git-scm.com/docs/git-bisect)
- [Google Testing Blog: Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we-mitigate-them)
