# Handoff Boundaries for `debugging`

## `debugging` owns
- Root-cause workflow after the symptom is clear enough to test
- Reproduction, minimization, isolation, hypothesis testing, and fix verification
- Regression isolation with recent-change comparison or `git bisect`
- Flaky-failure investigation when the immediate job is to stabilize and explain one failure

## Route to `log-analysis`
Use `log-analysis` when the user mainly needs to know **which lines matter** or **what the first actionable failure is**.

Examples:
- pasted stack traces or CI logs with no narrowed suspect yet
- browser/network/server evidence that still needs initial correlation
- repeated retry storms where the first blocker is still unknown

## Route to `testing-strategies`
Use `testing-strategies` when the main task becomes **coverage design, test-layer planning, or broad flaky-test prevention policy** rather than debugging one concrete failure.

Examples:
- redesigning the test pyramid
- deciding what belongs in unit vs integration vs E2E
- building org-wide flaky-test mitigation policy

## Route to `code-review`
Use `code-review` when the user is primarily asking for **preventive review** of a change set, not active root-cause investigation.

Examples:
- review this PR for bugs/security/perf issues
- audit this diff for maintainability concerns
- check whether tests/docs are sufficient before merge

## Route to `performance-optimization`
Use `performance-optimization` when the core job is **measurement and optimization tradeoffs** after the performance problem is already framed.

Examples:
- reduce p95 latency
- improve query plan or cache strategy
- tune CPU/memory hotspots with profiling data

## Practical rule
- If the user mainly needs **the important failing symptom**, start with `log-analysis`.
- If the user mainly needs **a reproduce → isolate → verify loop**, use `debugging`.
- If the user mainly needs **test-program architecture**, use `testing-strategies`.
- If the user mainly needs **preventive diff review**, use `code-review`.
- If the user mainly needs **optimization strategy**, use `performance-optimization`.
