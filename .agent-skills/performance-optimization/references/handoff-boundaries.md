# Handoff Boundaries

Use `performance-optimization` only when the core task is measurement-led tuning.

## Route to `monitoring-observability`
Use `monitoring-observability` when the unanswered question is:
- which metrics, traces, logs, dashboards, or alerts should exist
- how to instrument the service or app
- how to roll out observability platforms, exporters, or alert rules
- how to make performance signals continuously visible

Rule of thumb: observability sets up the telemetry. `performance-optimization` consumes that telemetry to choose a tuning move.

## Route to `debugging`
Use `debugging` when the unanswered question is:
- why the behavior is incorrect
- which change caused the regression
- how to reproduce or isolate a correctness failure
- whether the issue is a bug first and a performance issue second

Rule of thumb: if expected behavior is still unclear, debug first.

## Route to `code-refactoring`
Use `code-refactoring` when the unanswered question is:
- how to simplify or decompose a subsystem safely
- how to stage a cleanup or migration without changing behavior
- how to remove duplication or create reviewable slices
- whether the work is maintainability-driven rather than performance-driven

Rule of thumb: if performance evidence is not the reason for the change, it is not performance optimization yet.

## Route to `testing-strategies`
Use `testing-strategies` when the unanswered question is:
- which benchmarks or test layers should be merge-gating or release-gating
- how much validation depth is required across the org or repo
- what the benchmark/perf regression policy should be
- how to handle flaky or expensive performance suites at policy level

Rule of thumb: `performance-optimization` chooses enough verification for one bottleneck. `testing-strategies` designs the lasting policy.

## Route to `game-performance-profiler`
Use `game-performance-profiler` when the unanswered question is:
- how to interpret Unity Profiler or Unreal Insights captures
- whether a game/runtime issue is CPU, GPU, memory, streaming, or platform specific
- what profiling artifact to capture next for a game target
- how Steam Deck / console / mobile / VR constraints shape the diagnosis

Rule of thumb: `performance-optimization` can classify the broader problem, but engine-specific capture interpretation belongs there.

## Route to implementation skills
Use stack-specific implementation skills when the bottleneck is already isolated and the next step is mainly doing the change:
- `database-schema-design` for schema/index/data-model design
- `react-best-practices`, `state-management`, or `ui-component-patterns` for frontend structural implementation
- `workflow-automation` when the main work is CI/job automation rather than performance reasoning
