---
name: performance-optimization
description: >
  Run measurement-led performance tuning across frontend, backend, database, cache,
  and runtime bottlenecks. Use when the main job is to locate the tightest latency,
  throughput, memory, bundle-size, or frame-time constraint; choose the right
  profiling evidence; stage one or two high-leverage optimizations; and verify the
  before/after impact. Triggers on: performance bottleneck, slow page, slow API,
  bad p95, throughput issue, memory spike, bundle too large, query plan, CPU hot
  path, load test regression, and optimize this flow. Route telemetry setup to
  `monitoring-observability`, failure diagnosis to `debugging`, behavior-preserving
  cleanup to `code-refactoring`, validation policy to `testing-strategies`, and
  engine-specific Unity/Unreal capture interpretation to `game-performance-profiler`.
allowed-tools: Read Grep Glob Bash Write
compatibility: >
  Best for repositories, traces, benchmarks, query plans, flame graphs, browser
  profiles, load-test outputs, and runtime notes where the main decision is what to
  measure, what to tune first, and how to prove improvement. Not for observability
  platform setup, generic refactoring, or root-cause debugging of correctness bugs.
metadata:
  tags: performance, profiling, bottleneck-analysis, latency, throughput, memory, bundle-size, query-plans
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Performance Optimization

Use this skill when the main question is **"where is the tightest performance constraint, what evidence do we need, and which tuning move should we try first?"**

The job is not to dump random React, SQL, or caching tips.
The job is to:
1. classify the surface and performance symptom,
2. choose the right measurement or profiling artifact,
3. isolate the narrowest bottleneck that matters,
4. pick one or two high-leverage changes,
5. verify before/after impact and residual risk.

Read [references/tuning-modes.md](references/tuning-modes.md) before handling an unfamiliar performance complaint.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `performance-optimization`, `monitoring-observability`, `debugging`, `testing-strategies`, `code-refactoring`, or `game-performance-profiler` should own the next step.
Read [references/measurement-checklist.md](references/measurement-checklist.md) before writing a benchmark or profiling plan.

## When to use this skill
- Slow user-facing interactions, page loads, or render responsiveness where the bottleneck is not yet isolated
- High API latency, poor throughput, queue/backpressure issues, or CPU hot paths that need profiling before code changes
- Query-plan, indexing, or data-access performance work where `EXPLAIN`, waits, or row estimates matter
- Memory growth, allocation churn, or bundle-size regressions that need a measurement-first tuning plan
- Load/perf regression reviews where the main job is interpreting results and choosing the next optimization move
- Performance tuning briefs that need explicit tradeoffs, verification steps, and route-outs to adjacent implementation skills

## When not to use this skill
- **The main task is rolling out dashboards, alerts, metrics, traces, or log pipelines** → use `monitoring-observability`
- **The main task is reproducing a correctness bug, isolating a regression, or understanding why behavior is wrong** → use `debugging`
- **The main task is safe structural cleanup, decomposition, or codemod planning without performance evidence** → use `code-refactoring`
- **The main task is choosing org-wide test layers, merge/release gates, or benchmark policy** → use `testing-strategies`
- **The bottleneck is clearly inside a Unity/Unreal capture and engine-specific profiler interpretation is the main job** → use `game-performance-profiler`
- **The bottleneck is already isolated and the next task is stack-specific implementation detail**; route to the implementation skill after framing the tuning brief

## Instructions

### Step 1: Frame the performance complaint
Capture the smallest useful statement of the problem before prescribing fixes.

Record:
- surface: frontend interaction | page-load | API/service | database | cache | async job | runtime/game | unknown
- symptom: high latency | low throughput | memory growth | CPU saturation | slow query | large bundle | frame spike | unknown
- decision target: p50/p95/p99 latency, throughput, error rate under load, bundle size, memory ceiling, frame budget
- environment: local | CI benchmark | staging | production | device-specific | target hardware
- evidence available: browser trace, profiler, flame graph, query plan, slow-query log, APM trace, load-test output, benchmark notes
- whether this is a regression, chronic hotspot, or unknown

Quick frame:
```markdown
Surface: API + database
Symptom: p95 latency jumped from 180ms to 850ms on order search
Decision target: restore p95 < 250ms
Evidence: APM trace + EXPLAIN ANALYZE + slow query log
Environment: production-like staging
Regression: yes, after filter expansion
```

If the request is only “set up metrics and alerts,” hand off to `monitoring-observability`.
If the request is only “why is this feature broken?”, hand off to `debugging`.

### Step 2: Choose the tuning mode
Pick one primary mode from [references/tuning-modes.md](references/tuning-modes.md).

Primary modes:
- `interaction-and-rendering`
- `page-load-and-bundle`
- `api-latency-and-hot-paths`
- `database-plan-and-data-access`
- `throughput-and-capacity`
- `memory-and-allocation`
- `runtime-frame-budget`
- `unknown-needs-better-measurement`

Rule: one primary mode, optional secondary mode.
Do not mix every possible optimization axis into one answer.

### Step 3: Pick the evidence source before proposing changes
Do not guess. Choose the cheapest artifact that can expose the bottleneck.

Examples:
- Frontend interaction slowness → browser performance trace, interaction timing, component/render hotspots
- Page-load or bundle complaint → Lighthouse/WebPageTest baseline, bundle analyzer, request waterfall
- API CPU hotspot → profiler or flame graph, endpoint timing breakdown, serialization cost, downstream calls
- Database complaint → `EXPLAIN` / `EXPLAIN ANALYZE`, waits, row estimates, index usage, ORM query shape
- Throughput complaint → targeted load test, queue depth, saturation point, concurrency/connection bottlenecks
- Memory complaint → heap/alloc profile, cache cardinality, object lifetime, GC pressure
- Game/runtime complaint → frame capture, CPU/GPU/memory budget evidence, target hardware notes; if engine interpretation dominates, route to `game-performance-profiler`

Output this step as:
```markdown
Evidence to gather/use
- Primary artifact: ...
- Why this artifact is first: ...
- Secondary artifact only if needed: ...
```

### Step 4: Isolate the narrowest bottleneck
Translate the evidence into one bottleneck statement.

Good bottleneck statements:
- “The endpoint is CPU-bound inside JSON serialization after DB work already returned.”
- “The search query plan is doing a wide sort + filter because the composite index does not match the predicate.”
- “Interaction delay is dominated by one long task plus layout thrash in the results panel.”
- “Frame spikes line up with asset streaming bursts on target hardware.”

Avoid vague statements like “performance is bad overall.”

### Step 5: Propose one or two high-leverage changes
Prioritize the smallest credible move that attacks the bottleneck directly.

Candidate moves by mode:
- `interaction-and-rendering`: reduce rerender scope, defer non-critical work, avoid layout thrash, virtualize heavy lists, cut synchronous main-thread work
- `page-load-and-bundle`: split routes/modules, reduce JS, optimize asset delivery, compress/resize images, trim third-party cost, cache aggressively
- `api-latency-and-hot-paths`: remove blocking work, cache expensive responses, reduce serialization cost, parallelize safe downstream calls, precompute heavy transforms
- `database-plan-and-data-access`: fix query shape, add/adjust indexes, remove N+1 access, push filters earlier, change pagination strategy, reduce row width
- `throughput-and-capacity`: tune concurrency limits, queue shape, worker pool size, connection pool size, batch size, cache hit path
- `memory-and-allocation`: reduce churn, bound caches, reuse buffers/objects where appropriate, stream instead of buffering, shrink payloads
- `runtime-frame-budget`: reduce per-frame work, spread expensive tasks, lower draw/overdraw pressure, defer streaming bursts, simplify expensive effects

Rule of thumb: recommend at most two candidate changes unless the first step is gathering better evidence.

### Step 6: State tradeoffs and route-outs
Every tuning suggestion should include what could get worse.

Examples:
- caching may improve latency but increase staleness or memory pressure
- batching may improve throughput but hurt tail latency
- pagination/index changes may speed one query while complicating writes
- lazy loading or splitting may improve initial load but increase later interaction latency

Route implementation when needed:
- component/state architecture cleanup → `react-best-practices`, `state-management`, or `ui-component-patterns`
- schema/index/data-model redesign → `database-schema-design`
- telemetry rollout or ongoing alerting → `monitoring-observability`
- benchmark-gate policy → `testing-strategies`
- engine-specific profiler interpretation → `game-performance-profiler`

### Step 7: Verify before/after impact
Use [references/measurement-checklist.md](references/measurement-checklist.md).

Verification packet should include:
- baseline metric and environment
- changed variable(s)
- after metric under comparable conditions
- whether the main bottleneck moved or disappeared
- residual risk / follow-up measurement

Good verification brief:
```markdown
Baseline: p95 search latency 850ms on staging replay dataset
Change: added `(team_id, status, created_at)` index and removed N+1 author lookup
After: p95 230ms, DB time down 68%, CPU flat
Residual risk: cache miss path still spikes at 400ms for very wide date ranges
Next if needed: cap date window or async export path
```

## Output format

```markdown
## Performance Brief
- Surface:
- Symptom:
- Decision target:
- Primary mode:
- Evidence source:

## Bottleneck Hypothesis
- Primary bottleneck:
- Confidence:
- Why:

## Highest-Leverage Changes
1. ...
2. ...

## Tradeoffs / Risks
- ...

## Verification Plan
- Baseline:
- After:
- Guardrail:

## Route-outs
- ...
```

## Examples

### Example 1: API + DB latency regression
**Input:** “Our order search endpoint is suddenly slow after adding more filters. What should we optimize?”

**Expected shape:** classify as `database-plan-and-data-access` with an API secondary mode, ask for/query-plan evidence, isolate the hottest query or serialization layer, propose one or two targeted changes, then define before/after verification.

### Example 2: Sluggish frontend interaction
**Input:** “The dashboard feels laggy when filters change. Can you optimize it?”

**Expected shape:** classify as `interaction-and-rendering`, ask for a browser trace or concrete interaction timing, isolate the long task / rerender scope, propose one or two focused changes, and verify the target interaction metric.

### Example 3: Route-out to observability setup
**Input:** “We need metrics, dashboards, and alerts so we can catch slow endpoints.”

**Expected shape:** route to `monitoring-observability` instead of pretending the main task is already tuning.

### Example 4: Route-out to game engine profiler skill
**Input:** “Unreal is hitching on Steam Deck and I have an Insights capture.”

**Expected shape:** acknowledge the broader performance context but route engine-specific capture interpretation to `game-performance-profiler`.

## Best practices
1. Measure first, then tune.
2. Name one primary bottleneck before prescribing changes.
3. Keep recommendations bounded: one or two high-leverage moves beat a giant checklist.
4. Compare like-for-like environments when verifying impact.
5. Be explicit about tradeoffs, especially cache, consistency, and memory costs.
6. Route telemetry setup, debugging, refactoring, and validation policy to neighboring skills instead of absorbing everything.

## References
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance)
- [Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview)
- [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
- [Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html)
- [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine)
