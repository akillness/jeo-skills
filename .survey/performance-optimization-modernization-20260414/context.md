# Context: performance-optimization modernization

## Workflow Context
Performance work shows up when a system is technically correct but too slow, too expensive, too memory-hungry, or too frame-unstable to meet the product bar. Across frontend, backend, database, and game/runtime workflows, the practical loop is the same: establish a baseline, capture a profile/trace/plan, isolate the hottest constraint, apply one targeted change, and re-measure.

Official docs point to the same structure from different angles:
- Chrome DevTools and web.dev focus on trace-driven diagnosis for responsiveness and rendering issues rather than blind cleanup ([Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance), [Optimize INP](https://web.dev/articles/optimize-inp), [Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview)).
- PostgreSQL tuning guidance centers `EXPLAIN` / `EXPLAIN ANALYZE`, estimated-vs-actual rows, and plan shape rather than generic “optimize your DB” advice ([PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html), [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)).
- Unity and Unreal both frame optimization around captured profiler evidence, frame budgets, and target hardware verification ([Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html), [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine)).
- Flame-graph guidance exists because teams repeatedly need a way to see where CPU time actually goes before they tune anything ([Flame Graphs](https://www.brendangregg.com/flamegraphs.html)).

That makes `performance-optimization` a measurement-led tuning skill, not a refactoring, debugging, or telemetry-setup skill.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend engineer | Improve interaction latency, rendering cost, bundle size, and asset delivery | Intermediate to advanced |
| Backend / API engineer | Reduce endpoint latency, CPU hot paths, serialization cost, and service bottlenecks | Intermediate to advanced |
| Database-focused engineer / fullstack developer | Fix slow queries, bad plans, indexing gaps, and ORM query shape issues | Intermediate to advanced |
| Platform / tech lead | Decide where tuning effort belongs and what evidence is convincing before rollout | Advanced |
| Game / real-time runtime engineer | Hit frame budgets, reduce memory spikes, and validate on target hardware | Intermediate to advanced |

## Current Workarounds
1. Run Lighthouse or a browser trace only after someone complains, then manually inspect long tasks, render cost, and network waterfalls.
2. Capture one-off CPU profiles or flame graphs for a slow endpoint, make a guess, and compare before/after by hand.
3. Paste `EXPLAIN ANALYZE` output into PRs or chat and manually reason about row estimates, sorts, joins, and indexes.
4. Use APM or observability tools to find a suspicious service, then fall back to local profiling, query plans, or ad-hoc benchmark scripts to isolate the actual bottleneck.
5. In game/runtime workflows, capture a profiler session for one representative scene/build and optimize the hottest frame spikes manually.

Limitations of those workarounds:
- tooling is fragmented across browser, backend, DB, and engine layers
- traces and plans require expert interpretation
- results are noisy and scenario-dependent
- teams still track before/after evidence in notes, PR comments, or spreadsheets because optimization proof is weakly integrated into the main workflow

## Adjacent Problems
- `code-refactoring` overlaps when people want to simplify structure, but the driver there is maintainability or safe cleanup rather than measured speed/resource wins.
- `debugging` overlaps when a slowdown first looks like a bug, but debugging owns reproduce/isolate root-cause for failures while performance work owns bottleneck measurement and tuning tradeoffs.
- `testing-strategies` overlaps when teams need performance budgets or benchmark gates, but that skill should own validation policy while `performance-optimization` owns the tuning workflow itself.
- `monitoring-observability` overlaps when the first step is dashboards, alerts, traces, or instrumentation rollout, but observability is the telemetry layer that performance tuning consumes.
- `database-schema-design`, `react-best-practices`, and engine-specific skills remain implementation-adjacent neighbors; `performance-optimization` should route to them when the bottleneck is already isolated and the next job is stack-specific design.

## User Voices
- Chrome/web.dev materials are explicit that pages can feel “sluggish” because long tasks block interactions, which is why traces and interaction timing matter more than vague optimization advice ([Optimize INP](https://web.dev/articles/optimize-inp), [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance)).
- PostgreSQL documentation assumes the recurring operator question is “this query is slow; what plan did the optimizer choose and why?” rather than “which generic SQL tips should I apply?” ([PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)).
- Brendan Gregg’s flame graph material exists because practitioners repeatedly need to answer “where is the CPU time actually going?” before changing code ([Flame Graphs](https://www.brendangregg.com/flamegraphs.html)).
- Unity’s Profiler guidance reflects the common complaint that spikes are scene-specific and hardware-specific, so evidence from real captures matters more than intuition ([Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html)).
