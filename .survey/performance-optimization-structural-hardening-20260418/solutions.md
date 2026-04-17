# Solution Landscape: performance-optimization structural hardening

> Research note: normal `web_search` / `web_extract` failed in this environment, so this survey used direct primary docs, repo-local evidence, and indexed/tool-specific fallbacks.

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Chrome DevTools Performance | Browser trace / runtime inspection | Strong for long tasks, render work, interaction traces | Manual, browser-local, easy to misread without a scenario | https://developer.chrome.com/docs/devtools/performance |
| Lighthouse / Lighthouse CI | Audit baseline + regression checks | Shared vocabulary for performance/SEO and CI-friendly reporting | Coarse for exact bottleneck selection | https://developer.chrome.com/docs/lighthouse/overview ; https://github.com/GoogleChrome/lighthouse-ci |
| OpenTelemetry / Prometheus | Telemetry substrate | Strong for ongoing visibility and symptom capture | Does not decide the next optimization move | https://opentelemetry.io/docs/concepts/signals/ ; https://prometheus.io/docs/practices/instrumentation/ |
| PostgreSQL EXPLAIN / pg_stat_statements | DB plan and aggregate SQL evidence | Canonical DB-side evidence for query hotspots | Stack-specific and expertise-heavy | https://www.postgresql.org/docs/current/using-explain.html ; https://www.postgresql.org/docs/current/pgstatstatements.html |
| Flamegraphs / runtime profilers | Hot-path and CPU/runtime analysis | Good for concrete code-path isolation | Hard to summarize and compare across tools | https://www.brendangregg.com/flamegraphs.html ; https://docs.python.org/3/library/profile.html ; https://nodejs.org/api/perf_hooks.html |
| Grafana k6 / load-test compare views | Capacity / regression comparison | Useful for baseline-vs-run checks | Usually locked to one tool/script context | https://grafana.com/docs/grafana-cloud/testing/k6/analyze-results/test-comparison/ |
| Unity Profiler / Unreal Insights / Godot Profiler | Engine/runtime profiling | Essential for frame-budget and target-device work | Too specialized for the general optimization front door | https://docs.unity3d.com/Manual/Profiler.html ; https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-insights-in-unreal-engine ; https://docs.godotengine.org/en/stable/tutorials/scripting/debug/the_profiler.html |
| Spreadsheet / dashboard workflows (Rows, Google Sheets, CMS dashboards) | Non-engineer reporting and CWV tracking | Good for SEO/content/ops stakeholders | Weak structure for engineering handoff | https://rows.com/docs/loading-performance-audit ; https://moz.com/blog/how-to-automate-pagespeed-insights-for-multiple-urls-using-google-sheets ; https://github.com/WordPress/performance/pull/1098 |

## Categories
- **Interaction / render tracing** — DevTools, profiler traces, long-task views
- **Page-load / bundle auditing** — Lighthouse, Lighthouse CI, WebPageTest-style comparisons
- **API / runtime hot-path tuning** — traces, flamegraphs, runtime profilers
- **Database plan analysis** — EXPLAIN, statement stats, slow-query evidence
- **Throughput / capacity validation** — k6 and similar benchmark comparisons
- **Observability handoff** — OTel / Prometheus and similar telemetry stacks
- **Game / frame-budget profiling** — Unity, Unreal, Godot engine-native tools
- **Reporting / stakeholder dashboards** — Rows, Google Sheets, WordPress-style CWV dashboards

## What People Actually Use
People rarely arrive with a clean optimization brief. They show up with the artifact they already have: a Chrome trace, a Lighthouse report, an EXPLAIN plan, a flamegraph SVG, a Grafana comparison, a spreadsheet of URLs, or profiler screenshots from Unity/Unreal. That means the reusable skill value is less about listing optimization tips and more about choosing the right mode, translating the artifact into one bottleneck statement, and routing implementation or neighboring ownership correctly.

## Frequency Ranking
1. Browser DevTools + Lighthouse/CWV baseline work
2. Observability traces / metrics as backend symptom sources
3. DB-native plan tools (`EXPLAIN`, statement stats, slow-query logs)
4. Runtime profilers / flamegraphs once the hotspot is localized
5. Load/perf regression compare tools
6. Engine-native game profilers
7. Spreadsheet/dashboard reporting for content and growth workflows

## Key Gaps
- Tooling is strong within each slice but weak at **cross-slice routing**.
- Many artifacts support comparison, but only inside their own tool and with weak cross-functional handoff.
- Existing solutions do not automatically distinguish optimization from observability setup, debugging, structural cleanup, or engine-specific profiling.
- Compact discovery surfaces can easily drift back to stale generic wording even after the canonical skill improves.

## Contradictions
- Marketed tools imply “measure performance” is one product surface, but actual practice is fragmented by artifact type and owner.
- Audit/report tools promise guidance, yet teams still need manual translation into one concrete bottleneck and one or two bounded next moves.
- A generic performance skill sounds broad and helpful, but without strong route-outs it collapses observability, debugging, refactoring, and engine profiling into one noisy front door.

## Key Insight
The repo does not need another performance wrapper. The landscape is already fragmented across traces, audits, DB plans, profilers, load-test comparisons, and stakeholder dashboards. The durable win is to keep `performance-optimization` as the measurement-led router, make its intake artifact choices and route-outs sharper, and keep compact/discovery surfaces aligned so activation reflects the real boundary instead of the older generic “optimize everything” wording.
