---
name: performance-optimization
description: >
  Route performance work from the artifact people already have into one measurement-led
  tuning brief. Use when the main job is locating the tightest latency, throughput,
  memory, bundle-size, or frame-budget bottleneck; choosing the right trace, query
  plan, load-test result, profiler capture, or CWV report; naming one bottleneck;
  and recommending one or two bounded optimizations with before/after verification.
  Route telemetry rollout to monitoring-observability, correctness diagnosis to
  debugging, structural cleanup to code-refactoring, validation-policy design to
  testing-strategies, and engine-specific capture interpretation to
  game-performance-profiler.
allowed-tools: Read Grep Glob Bash Write
compatibility: >
  Best for repositories, traces, benchmarks, query plans, flame graphs, browser
  profiles, load-test outputs, CWV reports, profiler screenshots, and runtime notes
  where the main decision is what evidence means, what to tune first, and how to
  prove improvement. Not for observability platform setup, generic refactoring, or
  correctness-first debugging.
metadata:
  tags: performance, profiling, bottleneck-analysis, latency, throughput, memory, bundle-size, query-plans, web-vitals, flamegraphs
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  source: akillness/jeo-skills
---

# Performance Optimization

Use this skill when the main question is **"what artifact do we trust, where is the actual bottleneck, and what is the smallest tuning move worth trying first?"**

The job is not to dump generic React, SQL, caching, or game-performance tips.
The job is to classify the complaint, normalize the current artifact into one tuning brief, pick one primary mode, name one bottleneck, recommend one or two high-leverage changes, then verify before/after impact and route remaining work correctly.

Read [references/intake-packets-and-escalations.md](references/intake-packets-and-escalations.md) before handling an unfamiliar artifact packet.
Read [references/tuning-modes.md](references/tuning-modes.md) before handling an unfamiliar performance complaint.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `performance-optimization`, `monitoring-observability`, `debugging`, `testing-strategies`, `code-refactoring`, or `game-performance-profiler` should own the next step.
Read [references/measurement-checklist.md](references/measurement-checklist.md) before writing a benchmark or profiling plan.

## When to use this skill
- Slow interactions, page loads, route transitions, API hot paths, query plans, memory growth, bundle regressions, or frame-budget complaints where the bottleneck is not yet isolated
- Performance packets that arrive as traces, Lighthouse/CWV reports, flamegraphs, query plans, load-test diffs, profiler screenshots, benchmark notes, or stakeholder dashboards
- Cross-domain performance asks spanning CLI/dev workflow, web/fullstack, product/ops, marketing/content performance, or game-adjacent routing where the next owner is still unclear
- Situations where you need one bounded tuning brief instead of a generic performance tip dump

## When not to use this skill
- **The main task is rolling out dashboards, alerts, metrics, traces, or log pipelines** → use `monitoring-observability`
- **The main task is reproducing a correctness bug, isolating a regression, or understanding why behavior is wrong** → use `debugging`
- **The main task is safe structural cleanup, decomposition, or codemod planning without performance evidence** → use `code-refactoring`
- **The main task is choosing org-wide test layers, merge/release gates, or benchmark policy** → use `testing-strategies`
- **The bottleneck is clearly inside a Unity/Unreal/Godot capture and engine-specific interpretation is the main job** → use `game-performance-profiler`
- **The bottleneck is already isolated and the next task is stack-specific implementation detail**; route to the implementation skill after framing the tuning brief

## Instructions

### Step 1: Frame the complaint
Capture the smallest useful statement of the problem before prescribing fixes.

Record:
- surface: CLI/dev | frontend/page-load | API/service | database | async/capacity | report/dashboard | runtime/game | unknown
- symptom: high latency | low throughput | memory growth | CPU saturation | slow query | large bundle | weak CWV | frame spike | unknown
- decision target: p50/p95/p99 latency, throughput, bundle size, memory ceiling, frame budget, CWV metric, or benchmark duration
- environment: local | CI benchmark | staging | production | target device/hardware | mixed/unknown
- whether this is a regression, chronic hotspot, or vague complaint

Quick frame:
```markdown
Surface: API + database
Symptom: p95 latency jumped from 180ms to 850ms on order search
Decision target: restore p95 < 250ms
Environment: production-like staging
Regression: yes, after filter expansion
```

### Step 2: Start from the intake packet
Use [references/intake-packets-and-escalations.md](references/intake-packets-and-escalations.md).

Choose the packet the user actually has now:
- browser trace / DevTools recording
- Lighthouse, WebPageTest, or CWV report
- APM trace, flamegraph, profiler output, or benchmark diff
- `EXPLAIN` / query-plan / slow-query artifact
- profiler screenshot / stat overlay / engine capture
- spreadsheet, dashboard, report summary, or no usable artifact yet

Output this step as:
```markdown
## Intake Packet
- Current artifact:
- Why it is enough (or not enough):
- Missing context to collect next:
```

Rule: do not force users into an ideal measurement flow if the current artifact already narrows the next decision.

### Step 3: Choose one primary tuning mode
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

### Step 4: Name the bottleneck before proposing fixes
Translate the evidence into one bottleneck statement.

Good bottleneck statements:
- “The endpoint is CPU-bound inside JSON serialization after DB work already returned.”
- “The search query plan is doing a wide sort + filter because the composite index does not match the predicate.”
- “Interaction delay is dominated by one long task plus layout thrash in the results panel.”
- “Frame spikes line up with asset streaming bursts on target hardware.”
- “The CWV report shows LCP dominated by image payload and render-blocking script cost, not server latency.”

Avoid vague statements like “performance is bad overall.”

### Step 5: Recommend one or two high-leverage changes
Prioritize the smallest credible move that attacks the named bottleneck directly.

Candidate moves by mode:
- `interaction-and-rendering`: reduce rerender scope, defer non-critical work, avoid layout thrash, virtualize heavy lists, cut synchronous main-thread work
- `page-load-and-bundle`: split routes/modules, reduce JS, optimize asset delivery, compress/resize images, trim third-party cost, cache aggressively
- `api-latency-and-hot-paths`: remove blocking work, cache expensive responses, reduce serialization cost, parallelize safe downstream calls, precompute heavy transforms
- `database-plan-and-data-access`: fix query shape, add/adjust indexes, remove N+1 access, push filters earlier, change pagination strategy, reduce row width
- `throughput-and-capacity`: tune concurrency limits, queue shape, worker pool size, connection pool size, batch size, or cache hit path
- `memory-and-allocation`: reduce churn, bound caches, reuse buffers/objects where appropriate, stream instead of buffering, shrink payloads
- `runtime-frame-budget`: reduce per-frame work, spread expensive tasks, lower draw/overdraw pressure, defer streaming bursts, simplify expensive effects
- `unknown-needs-better-measurement`: do not guess; ask for the cheapest artifact that can separate likely causes

Rule of thumb: recommend at most two candidate changes unless the next move is gathering better evidence.

### Step 6: State tradeoffs and route-outs
Every tuning suggestion should include what could get worse.

Examples:
- caching may improve latency but increase staleness or memory pressure
- batching may improve throughput but hurt tail latency
- pagination/index changes may speed one query while complicating writes
- lazy loading or splitting may improve initial load but increase later interaction latency
- image compression or asset simplification may reduce quality or require content/design signoff

Route implementation when needed:
- component/state architecture cleanup → `react-best-practices`, `state-management`, or `ui-component-patterns`
- schema/index/data-model redesign → `database-schema-design`
- telemetry rollout or ongoing alerting → `monitoring-observability`
- benchmark-gate policy → `testing-strategies`
- engine-specific profiler interpretation → `game-performance-profiler`
- correctness-first reproduction or environment drift → `debugging`

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
Residual risk: cache-miss path still spikes at 400ms for very wide date ranges
Next if needed: cap date window or async export path
```

## Output format

```markdown
## Performance Brief
- Surface:
- Symptom:
- Decision target:
- Primary mode:
- Current artifact:

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
**Input:** “Our order search endpoint is suddenly slow after adding more filters. We have `EXPLAIN ANALYZE` output and slow query logs.”

**Expected shape:** classify as `database-plan-and-data-access` with an API secondary mode, use the current artifacts instead of asking for generic telemetry first, isolate the hottest query or serialization layer, propose one or two targeted changes, then define before/after verification.

### Example 2: Marketing / content performance report
**Input:** “Our landing-page CWV report shows poor LCP and INP. We have Lighthouse and field data but not a profiler trace yet.”

**Expected shape:** classify as `page-load-and-bundle`, treat the report as a real intake packet, separate likely asset/render-blocking causes from telemetry gaps, recommend one or two bounded next moves, and note when additional traces would be worth collecting.

### Example 3: Route-out to observability setup
**Input:** “We need dashboards, traces, and alerts so we can catch slow endpoints before users complain.”

**Expected shape:** route to `monitoring-observability` instead of pretending the main task is already optimization.

### Example 4: Route-out to game engine profiler skill
**Input:** “Unreal is hitching on Steam Deck and I have an Insights capture. Can you help interpret it?”

**Expected shape:** acknowledge the broader performance context but route engine-specific capture interpretation to `game-performance-profiler`.

## Best practices
1. Start from the artifact the user already has; normalize it into a tuning brief instead of discarding it.
2. Measure first, then tune.
3. Name one primary bottleneck before prescribing changes.
4. Keep recommendations bounded: one or two high-leverage moves beat a giant checklist.
5. Compare like-for-like environments when verifying impact.
6. Be explicit about tradeoffs, especially cache, consistency, memory, and content-quality costs.
7. Route telemetry setup, debugging, refactoring, and engine-specific profiler reading to neighboring skills instead of absorbing everything.

## References
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance)
- [Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview)
- [Core Web Vitals](https://web.dev/articles/vitals)
- [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [Flame Graphs](https://www.brendangregg.com/flamegraphs.html)
- [Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html)
- [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine)
- [Godot Profiler](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/the_profiler.html)
