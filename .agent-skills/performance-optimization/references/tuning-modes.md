# Tuning Modes

Use one primary mode per request. Add a secondary mode only when the evidence clearly spans layers.

## `interaction-and-rendering`
Use when the complaint is about sluggish clicks, filter changes, scrolling, layout thrash, or heavy rerenders.

Look for:
- long tasks
- rerender fan-out
- layout / style recalculation cost
- expensive client-side transforms
- main-thread work that blocks input handling

## `page-load-and-bundle`
Use when the complaint is about first paint, LCP, oversized bundles, or request waterfalls.

Look for:
- large JS/CSS/image payloads
- render-blocking resources
- bad cacheability
- third-party script cost
- route/module split opportunities

## `api-latency-and-hot-paths`
Use when one endpoint, job, or code path is slow even after the workload is known.

Look for:
- CPU-heavy transforms
- serialization cost
- blocking I/O
- slow downstream dependencies
- duplicated work inside the request path

## `database-plan-and-data-access`
Use when SQL/ORM behavior is the main suspect.

Look for:
- missing or mismatched indexes
- N+1 access patterns
- bad join/order/filter plans
- too many rows read before filtering
- pagination or row-width issues

## `throughput-and-capacity`
Use when the complaint is saturation under load rather than one slow request.

Look for:
- queue depth growth
- worker-pool saturation
- connection-pool contention
- lock contention
- rate-limit or concurrency mismatches

## `memory-and-allocation`
Use when the issue is memory growth, allocation churn, or GC pressure.

Look for:
- cache cardinality growth
- temporary object churn
- buffering large payloads
- leaks or forgotten lifetimes
- repeated parsing/serialization work

## `runtime-frame-budget`
Use when the issue is frame-time spikes, low FPS, or target-device/runtime performance.

Look for:
- per-frame CPU spikes
- GPU pressure
- asset streaming bursts
- draw-call/overdraw problems
- device-specific thermal or platform constraints

## `unknown-needs-better-measurement`
Use when the complaint is vague and the existing evidence does not yet justify a tuning move.

Recommended output:
- what to capture next
- why that artifact is the first one
- what decision it will unlock
