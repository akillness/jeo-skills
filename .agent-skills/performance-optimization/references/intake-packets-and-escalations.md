# Intake Packets and Escalations

Start from the artifact the user already has. Do not throw it away just because a different tool would be ideal.

## Browser trace / DevTools recording
Use when the complaint is sluggish clicks, filter changes, scrolling, layout thrash, or slow route interactions.

Look for:
- long tasks
- rerender fan-out
- layout/style recalculation cost
- scripting bursts before paint
- network waterfalls tied to interaction

Escalate when:
- the trace points to framework/component structure work → `react-best-practices`, `state-management`, or `ui-component-patterns`
- the trace is only a symptom and backend latency dominates → stay in `performance-optimization` and switch modes

## Lighthouse / WebPageTest / CWV report
Use when the complaint is poor LCP/INP/CLS, weak landing-page speed, or stakeholder-facing page-performance review.

Look for:
- large image or font payloads
- render-blocking CSS/JS
- third-party script cost
- weak cacheability
- clear server-vs-client split

Escalate when:
- the ask is ongoing telemetry, dashboards, or field-data rollout → `monitoring-observability`
- the next work is content/design/system implementation rather than bottleneck reasoning → route after naming the bottleneck

## APM trace / flamegraph / runtime profiler
Use when the complaint is endpoint latency, CPU hot paths, serialization cost, or runtime overhead.

Look for:
- one expensive function or span
- downstream call fan-out
- serialization/deserialization cost
- lock contention or blocking I/O
- repeated work inside the hot path

Escalate when:
- the root issue is correctness or regression isolation first → `debugging`
- the bottleneck is already isolated and the next work is implementation-specific

## Query plan / slow-query artifact
Use when SQL or ORM behavior is the main suspect.

Look for:
- missing or mismatched indexes
- wide sorts / joins / scans
- bad row estimates
- N+1 access patterns
- pagination or row-width issues

Escalate when:
- the next task is schema/index/data-model redesign → `database-schema-design`
- the query is only one symptom of a broader incident and reproduction is still unclear → `debugging`

## Load-test comparison / benchmark diff
Use when the complaint is throughput, queue growth, worker saturation, or a regression across runs.

Look for:
- changed saturation point
- queue-depth growth
- concurrency or connection-pool pressure
- one endpoint dominating errors/latency
- whether the comparison is trustworthy across the same workload

Escalate when:
- the ask is benchmark policy / gating across the repo or org → `testing-strategies`
- the evidence is too noisy to support a concrete bottleneck statement

## Profiler screenshot / stat overlay / engine capture
Use when the complaint is frame spikes, low FPS, platform-specific hitching, or runtime streaming cost.

Look for:
- CPU vs GPU vs memory pressure
- frame-budget overruns
- streaming bursts or asset spikes
- target-device differences
- whether the artifact is enough to classify the bottleneck before engine-specific interpretation

Escalate when:
- the main job is Unity/Unreal/Godot capture interpretation → `game-performance-profiler`
- there is no real capture yet and the next step is deciding what to record on target hardware

## Spreadsheet / dashboard / report summary
Use when marketing, growth, product, or ops stakeholders bring a report instead of a profiler artifact.

Look for:
- repeated weak metrics by page/cohort/device
- whether the report already separates field vs lab data
- obvious asset, render-blocking, or backend symptoms
- whether the ask is a stakeholder summary or a tuning brief

Escalate when:
- the real job is report production / dashboard design rather than optimization → another reporting/analytics skill
- the report only proves a symptom and the next step is collecting a better engineering artifact

## No usable artifact yet
Use `unknown-needs-better-measurement` when the complaint is too vague to justify a tuning move.

Ask for the cheapest artifact that can separate likely causes:
- browser trace for interaction slowness
- Lighthouse or CWV report for page-load complaints
- APM trace / flamegraph for endpoint CPU issues
- `EXPLAIN` / slow-query data for SQL complaints
- benchmark comparison for throughput/regression claims
- target-device capture for frame-budget issues
