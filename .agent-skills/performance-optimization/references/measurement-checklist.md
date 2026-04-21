# Measurement Checklist

Use this checklist before claiming a win.

## Baseline
- What exact metric matters? (`p95 latency`, `bundle size`, `frame time`, `memory ceiling`, `throughput`)
- What environment produced the number? (`local`, `staging replay`, `prod trace`, `target hardware`)
- What workload or scenario was used?
- Is the metric stable enough to compare, or is more sampling needed?

## Evidence quality
- Primary artifact captured: trace, flame graph, query plan, heap/alloc profile, load-test output, frame capture
- Why this artifact is enough for the current decision
- Known blind spots or confounders

## Proposed change
- One or two changes only
- Explicit expected effect on the chosen metric
- Known tradeoffs: cache freshness, memory growth, complexity, write amplification, visual quality, etc.

## Verification
- Same workload or close equivalent as baseline
- Before/after numbers written together
- Check whether the bottleneck moved somewhere else
- Note residual risk or next measurement if the problem is only partially solved

## Example
```markdown
Metric: p95 search latency
Environment: staging replay with production-like dataset
Baseline: 850ms
Artifact: EXPLAIN ANALYZE + APM trace
Change: composite index + remove N+1 author fetch
After: 230ms
Tradeoff: slightly slower writes on order update path
Residual risk: very wide date-range queries still spike
```
