# Handoff Boundaries

Use `code-refactoring` only while the main task is structural improvement with behavior preservation.

## Route to `debugging`
Use `debugging` when the unanswered question is:
- why the bug exists
- which recent change caused a regression
- how to reproduce or isolate the failure
- whether hidden runtime behavior still needs investigation before cleanup

Rule of thumb: if expected behavior is still unclear, diagnose first.

## Route to `code-review`
Use `code-review` when the unanswered question is:
- is this diff ready to merge
- what comments should a reviewer leave
- which risks or missing evidence should block approval
- how to classify findings by severity

Rule of thumb: `code-refactoring` plans or applies cleanup; `code-review` judges the finished change.

## Route to `testing-strategies`
Use `testing-strategies` when the unanswered question is:
- what test layers should exist for this area
- what merge/release gates are appropriate
- how much validation depth is needed across the org or repo
- how to manage flake policy, risk tiers, or environment coverage

Rule of thumb: `code-refactoring` chooses enough verification for one cleanup; `testing-strategies` designs the policy.

## Route to `performance-optimization`
Use `performance-optimization` when the unanswered question is:
- where the bottleneck is
- what should be measured or profiled
- which latency, throughput, memory, or bundle tradeoffs matter most
- how to tune for speed rather than structure

Rule of thumb: if performance evidence drives the work, profiling owns the next step and refactoring becomes a follow-up.

## Route to `codebase-search`
Use `codebase-search` when the next task is mostly inventory:
- find all call sites
- map ownership or import edges
- identify which modules or files use a pattern
- collect the raw impact set before designing the cleanup
