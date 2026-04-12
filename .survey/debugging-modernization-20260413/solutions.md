# Solution Landscape: debugging modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Scientific / hypothesis-driven debugging | Explicit observe → hypothesize → experiment → confirm loop | Transfers across languages, stacks, and agent workflows | Can feel slow without strong evidence discipline | Best canonical backbone for a reusable skill |
| Reproduction-first / minimization | Make the bug reliable, then shrink it | Converts vague symptoms into a controlled experiment | Tedious for flaky or environment-dependent failures | Strong fit for agent workflows |
| Divide-and-conquer / binary search | Isolate by halving surface area or history | Fast narrowing, scriptable, works with code/config/history | Needs a reliable pass/fail signal | Includes `git bisect` and scope slicing |
| Observability-assisted debugging | Use logs, traces, metrics, profiling, correlation IDs | Best for production/distributed failures | Telemetry shows symptoms more easily than causes | Should remain adjacent, not replace debugging reasoning |
| Regression isolation | Compare known-good vs broken state | Great for "what changed?" hunts | Finds where more easily than why | Pairs well with `git bisect` |
| Flaky-test debugging | Stabilize nondeterministic failures, control timing/data | High value for CI and benchmark workflows | Labor-intensive, often manual | Strong neighboring pattern for `testing-strategies` |
| Interactive debugger workflows | Breakpoints, watches, stepping, call stacks | Excellent local state inspection | Less helpful when failures are distributed or non-local | Should be one tactic, not the whole skill |
| Delta/fault-localization methods | Algorithmic narrowing, slicing, statistical hints | Good as advanced references | Less universal in day-to-day developer work | Keep as optional advanced layer |

## Categories
- **Core methods:** reproduction, minimization, hypothesis testing, binary search, compare-good-vs-bad-state
- **Tool-supported workflows:** debuggers, `git bisect`, profiling, logs/traces/metrics, crash dumps
- **High-friction environments:** CI/flaky tests, production incidents, distributed systems, concurrency and performance bugs
- **JTBD alternatives / substitutes:** log triage, test hardening, feature-flag rollback/isolation, targeted instrumentation, code review, and observability tooling

## What People Actually Use
Developers still rely on a small set of durable manual moves even when sophisticated tools exist: add temporary logging, reproduce locally, minimize the failing case, compare recent changes, rerun flaky tests, and use `git bisect` when history can provide a reliable pass/fail boundary. Observability and debuggers help, but they do not eliminate the need for a bounded reasoning loop.

## Frequency Ranking
1. Reproduce and minimize the failure
2. Hypothesis-driven debugging
3. Divide-and-conquer / binary search isolation
4. Compare working vs broken state / recent-change analysis
5. Observability-assisted localization
6. Add temporary instrumentation or assertions
7. Flaky/nondeterministic failure handling
8. Advanced algorithmic debugging methods

## Key Gaps
- Many resources describe tactics, but fewer present a clean routing layer that separates **symptom triage** (`log-analysis`) from **root-cause workflow** (`debugging`) and then from **coverage hardening** (`testing-strategies`) or **review prevention** (`code-review`).
- Practical debugging still depends on manual evidence stitching across logs, tests, recent commits, feature flags, and environment differences.
- Existing debugging advice is often too broad; it rarely spells out when to stop gathering symptoms and switch into a reproducible experiment loop.

## Contradictions
- Modern observability vendors imply richer telemetry reduces debugging toil, but practitioner reality still falls back to print statements, local repro, and ad hoc minimization.
- Debuggers promise deep inspection, yet many real failures are CI-, data-, config-, or production-only and cannot be solved by stepping through local code alone.

## Key Insight
The strongest modernization path is not to turn `debugging` into a bag of debugger commands. It should become the repository's **systematic root-cause workflow**: start from a reproducible symptom, isolate the failing boundary, form and test hypotheses, verify the fix, and explicitly route symptom-only log work to `log-analysis` and post-fix coverage hardening to `testing-strategies`.

## Curated Sources
- VS Code debugging docs: https://code.visualstudio.com/docs/editor/debugging
- Git bisect docs: https://git-scm.com/docs/git-bisect
- pytest flaky tests: https://docs.pytest.org/en/stable/explanation/flaky.html
- Google SRE troubleshooting methodology: https://sre.google/sre-book/effective-troubleshooting/
- OpenTelemetry docs: https://opentelemetry.io/docs/
- LaunchDarkly feature-flag technical debt guide: https://launchdarkly.com/docs/guides/flags/technical-debt
- The Debugging Book: https://www.debuggingbook.org/
- Why Programs Fail: https://www.whyprogramsfail.com/
