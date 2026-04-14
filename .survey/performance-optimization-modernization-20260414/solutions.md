# Solution Landscape: performance-optimization modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Chrome DevTools Performance | Browser trace / profiling | Free, ubiquitous, interaction and render evidence | Manual interpretation, scenario-specific | Best frontend baseline for isolate-and-measure workflows ([docs](https://developer.chrome.com/docs/devtools/performance)) |
| Lighthouse | Automated web audit / lab metrics | Fast baseline, common language, CI-friendly | Lab score can mislead if treated as the whole truth | Good entry point, not enough alone ([overview](https://developer.chrome.com/docs/lighthouse/overview)) |
| WebPageTest | Web performance testing | Strong request waterfall and comparative page-load evidence | Separate tool surface, may be blocked or manual | Good complement to Lighthouse for page-load analysis ([site](https://www.webpagetest.org/)) |
| Datadog / New Relic / Dynatrace / AppDynamics | APM + traces + metrics | Cross-service visibility, good hotspot discovery | Cost, telemetry sprawl, agent/instrumentation complexity | Better for finding suspicious areas than prescribing code changes ([Datadog pricing](https://www.datadoghq.com/pricing/)) |
| pg_stat_statements + EXPLAIN / EXPLAIN ANALYZE | Query-level DB diagnosis | Precise query/plan evidence, works with normal DB workflows | Requires operator skill, output can be dense | Core DB tuning workflow ([EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html), [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)) |
| pganalyze / DB analyzers | Commercial DB performance tooling | Better surfacing of waits/plans and repeated offenders | Commercial pricing, DB-specific | Useful when DB is clearly the bottleneck ([pricing](https://pganalyze.com/pricing)) |
| Brendan Gregg flame graphs / CPU profilers | CPU hotspot visualization | Strong bottleneck isolation for backend/runtime code | Needs capture discipline and interpretation | Important conceptual anchor for backend tuning ([Flame Graphs](https://www.brendangregg.com/flamegraphs.html)) |
| k6 / JMeter / BlazeMeter | Load and capacity testing | Useful for throughput ceilings and regression comparisons | Easy to get unrealistic scripts; load tests alone do not explain hotspots | Best after defining the path and success metric ([BlazeMeter pricing](https://www.blazemeter.com/pricing)) |
| Unity Profiler / Unreal Insights | Engine/runtime profiling | Frame-budget, CPU/GPU, memory visibility | Engine-specific and steeper learning curve | Relevant for game-dev and real-time runtime work ([Unity Profiler](https://docs.unity3d.com/Manual/Profiler.html), [Unreal Insights](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine)) |

## Categories
- **Frontend/web baseline and interaction tuning**: Chrome DevTools, Lighthouse, WebPageTest
- **Backend/service hotspot discovery**: flame graphs, CPU profilers, APM suites
- **Database bottleneck isolation**: `pg_stat_statements`, `EXPLAIN`, DB analyzers like pganalyze
- **Load/capacity verification**: k6, JMeter, BlazeMeter
- **Game/runtime profiling**: Unity Profiler, Unreal Insights

## What People Actually Use
The practical pattern is still lightweight and manual:
- run Lighthouse or a browser trace, then inspect one interaction/page at a time
- capture a CPU profile or flame graph on one slow request/job, then test one fix
- inspect `EXPLAIN ANALYZE` output query by query instead of applying generic DB tips
- use APM to find a suspicious service, then fall back to local profiling or query plans to isolate the real hotspot
- re-run targeted load/perf checks to verify the chosen bottleneck actually improved

This is closer to **measure -> isolate -> tune -> verify** than to a generic “optimization checklist.”

## Frequency Ranking
1. **Baseline browser/APM/DB measurement tools** — repeatedly used because performance work starts with evidence, not blind edits.
2. **Profilers and traces** — common second step once a suspicious path is known.
3. **Load/perf testing tools** — useful for proving capacity ceilings or regressions, but not enough alone.
4. **Engine-specific profilers** — important for game/runtime workflows but narrower than the web/backend/db stack.

## Key Gaps
- Most tools are **layer-specific**, while real incidents often cross browser, API, database, cache, and runtime boundaries.
- Tool outputs surface hotspots but rarely explain **which kind of change** is most appropriate next.
- Existing guides often collapse measurement, diagnosis, observability setup, refactoring, and testing into one bucket, which makes skill activation noisy.
- The current repo skill is too example-heavy and React-centric relative to the broader performance workflow evidence.

## Contradictions
- Marketed tool language often implies “full-stack performance visibility,” but teams still fall back to narrow local traces, query plans, and manual before/after comparisons when making code changes.
- Lighthouse/APM/load-testing tools suggest broad coverage, yet practitioners still need scenario-specific reproduction and evidence because scores and traces can vary by environment.
- Generic optimization checklists imply one reusable recipe, while actual workflows split into frontend interaction cost, backend CPU/latency, DB plan quality, and runtime/frame-budget tuning.

## Key Insight
The strongest modernization direction is not to stuff more vendor tools or code snippets into `performance-optimization`. It is to make the skill a **measurement-led bottleneck workflow** that classifies the surface, chooses the right evidence source, isolates the tightest constraint, proposes a small number of high-leverage changes, verifies before/after impact, and routes observability setup, debugging, refactoring, or stack-specific implementation to neighboring skills when needed.
