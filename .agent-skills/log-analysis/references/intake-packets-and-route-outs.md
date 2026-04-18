# Intake packets and route-outs

## Packet chooser
Use one primary packet per run.

| Packet | Use when | Typical request shape | Route-out signal |
|---|---|---|---|
| `app-runtime` | Plain text app/API/worker/proxy logs are the main evidence | stack trace, request failure, worker crash, queue poison message | Once the likely code/config suspect is known and the user wants debugging |
| `container-runtime` | The evidence comes from `docker logs`, `kubectl logs`, pod output, or restart windows | crash loop, env mismatch, dependency connection failure, one deploy window | Once the user needs telemetry coverage, rollout investigation, or config/code remediation |
| `browser-plus-api` | Browser symptoms need backend correlation | failed fetch, 401/403/500 mismatch, SSR/client divergence, CORS/auth confusion | Once the backend/auth/config suspect is clear and debugging owns the next step |
| `ci-cascade` | CI output contains many secondary failures after one blocker | install failure, import error, build footer noise, broad test abort | Once the earliest failing step is isolated and fix planning starts |
| `structured-json` | Logs are field-rich and grouping is cheaper than scrolling raw text | request/trace correlation, service split, webhook/event records, JSON rows | Once the job becomes anomaly hunting across larger datasets or monitoring coverage |
| `security-signal` | Access/error logs mainly show suspicious probing or auth/permission anomalies | repeated 401/403/404 probes, token misuse, bursty abuse patterns | Once the work becomes security remediation or long-lived monitoring/alerting design |

## Fast anchor ladder
Pick the cheapest anchor that reduces uncertainty fastest:
1. timestamp window
2. request / trace / correlation ID
3. job/build/stage ID
4. service / worker / pod / container name
5. route or browser action
6. user / tenant / session identifier (only when safe to mention)

## Packet heuristics
- **app-runtime** → look for the first exception or hard stop before retry noise.
- **container-runtime** → compare restart timing, service reachability, and env/config assumptions first.
- **browser-plus-api** → treat browser errors as symptoms until backend evidence confirms the blocker.
- **ci-cascade** → generic abort/footer lines are almost never the real root cause.
- **structured-json** → group by message family / exception class before reading row by row.
- **security-signal** → separate broad probing from one broken client or stale credential before escalating.

## Quick route-outs
- First blocker isolated and user wants reproduction/fix hypotheses → `debugging`
- User really needs dashboards, alerts, ingestion, retention, or coverage design → `monitoring-observability`
- User wants repeated anomaly/rule hunting across wider log or telemetry windows → `pattern-detection`
- Logs are Unity / Unreal build, editor, package, or player specific → `game-build-log-triage`

## Smell test
If your next paragraph is mostly about code fixes, monitor design, or broad anomaly programs instead of the first actionable blocker plus blast radius, `log-analysis` has already done its job.
