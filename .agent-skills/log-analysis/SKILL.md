---
name: log-analysis
description: >
  Route runtime-log requests into one evidence packet before diagnosing anything.
  Use when the user shares app/server/container/browser/CI/JSON log output and
  wants the first actionable blocker, repeated signature, likely blast radius,
  or safest next read-only checks. Choose one packet: app-runtime,
  container-runtime, browser-plus-api, ci-cascade, structured-json, or
  security-signal. Triggers on: check the logs, which line matters, real error,
  first blocker, noisy stack trace, retry storm, browser 401/500, pod logs,
  worker crash, CI abort, webhook failure. Route engine-specific Unity/Unreal
  logs to `game-build-log-triage`, observability design to
  `monitoring-observability`, and remediation/debug hypotheses to `debugging`.
allowed-tools: Bash Read Grep Glob
compatibility: >
  Best for repositories, incidents, or pasted excerpts where the main task is
  read-only log triage rather than observability platform setup or code changes.
metadata:
  tags: logs, triage, debugging, observability, incidents, ci, browser, grep
  version: "2.1"
  source: akillness/jeo-skills
---

# Log Analysis

## When to use this skill
- The main job is **read-only log triage**, not code changes or monitoring design.
- The user wants the **first actionable blocker**, not a paraphrase of every line.
- The evidence is **application, API, worker, proxy, container, pod, browser, CI, or JSON logs**.
- The user needs the **repeated signature or blast radius** summarized after the first failure is isolated.
- The prompt is really **"which lines matter / what is the real error / where does the cascade start?"** even if the user never says "triage".

Do **not** use this skill as the main workflow when:
- The logs are **Unity / Unreal build, cook, package, editor, or player logs** → use `game-build-log-triage`.
- The real job is **instrumentation, dashboards, alerting, ingestion, retention, or observability coverage** → use `monitoring-observability`.
- The likely blocker is already known and the user now needs **reproduction, hypotheses, or fixes** → use `debugging`.
- The main job is **repeated anomaly/rule hunting across logs or telemetry families** rather than first-failure triage → use `pattern-detection`.

## Core idea
`log-analysis` should act like a **packet router**, not a giant troubleshooting encyclopedia.

1. Normalize the request into **one primary log packet**.
2. Narrow the evidence slice before interpreting it.
3. Isolate the **earliest actionable failure**.
4. Group repeated fallout into a **pattern / blast radius** note.
5. Route out as soon as the work becomes debugging, observability design, anomaly hunting, or engine-specialist triage.

Read these support docs before choosing the packet:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/triage-playbook.md](references/triage-playbook.md)
- [references/source-boundaries.md](references/source-boundaries.md)

## Instructions

### Step 1: Normalize the request
Convert the prompt into this intake shape first:

```yaml
log_analysis_packet:
  primary_packet: app-runtime | container-runtime | browser-plus-api | ci-cascade | structured-json | security-signal
  source_shape: app | proxy | worker | browser | ci | container | pod | json | mixed | unknown
  environment: local | ci | staging | production | browser | container | pod | unknown
  failure_goal: first-blocker | cascade-start | repeated-signature | blast-radius | suspicious-access | unknown
  anchor: timestamp | request-id | trace-id | job-build-id | browser-route | none | unknown
  route_after: stay-here | debugging | monitoring-observability | pattern-detection | game-build-log-triage
```

Choose **one** primary packet for the run. If two seem plausible, pick the cheaper packet that reduces uncertainty fastest.

### Step 2: Choose the packet

| Packet | Use when | Best fits | Typical anchors |
|---|---|---|---|
| `app-runtime` | The key evidence is app/API/worker/proxy text logs | crashes, stack traces, request failures, queue poison messages | earliest fatal/error line, route, service, request ID |
| `container-runtime` | The evidence comes from `docker logs`, `kubectl logs`, pod output, or deploy-window restarts | container crashes, env/config mismatch, dependency connectivity, restart loops | pod/container name, deploy window, host, request ID |
| `browser-plus-api` | Browser console/network symptoms need server-side confirmation | 401/403/500 flows, failed fetch, CORS/auth mismatch, SSR/client divergence | route, request ID, timestamp, browser/network trace |
| `ci-cascade` | CI output contains many secondary failures after one blocker | install/import/test/build cascades, missing dependency/config, runner mismatch | job name, step name, stage, earliest stack trace/import error |
| `structured-json` | The logs are JSON or field-rich event records | grouped error families, request/trace correlation, worker/event triage | level, service, request ID, trace ID, tenant, event name |
| `security-signal` | Access/error logs suggest suspicious probing or auth/permission anomalies | repeated 401/403/404 probes, token misuse, rate-limit storms | IP/user/session, route family, status code, time window |

Packet rules:
- Prefer `app-runtime` for plain text stack traces and server logs.
- Prefer `container-runtime` when restart timing, pod identity, or env/deploy context matters.
- Prefer `browser-plus-api` when frontend symptoms are not sufficient on their own.
- Prefer `ci-cascade` when the visible failure may be generic abort noise.
- Prefer `structured-json` when fields make grouping and correlation cheaper than free-text scanning.
- Prefer `security-signal` only when suspicious access/auth behavior is the main job; otherwise keep security-looking noise inside the packet that owns the first blocker.

### Step 3: Narrow the slice before reading everything
Apply at least one narrowing move before interpreting the logs:
- limit by time window
- limit by request / trace / job / build / session / tenant identifier
- separate fatal/actionable lines from retries and fallout
- separate one noisy source from many affected sources
- separate browser symptom lines from server-side blocker lines
- in CI, locate the earliest failing step before summarizing the full transcript

Useful heuristics by packet:
- **app-runtime** → exception / fatal / failed / timeout / refusal first
- **container-runtime** → restart window + dependency/connectivity/env mismatch first
- **browser-plus-api** → backend auth/config/runtime evidence before generic client symptoms
- **ci-cascade** → earliest import/config/build/test failure before abort/footer lines
- **structured-json** → group by message family, exception class, request ID, or service before reading raw rows
- **security-signal** → distinguish broad probing from one broken client before escalating

### Step 4: Isolate the first actionable failure
Use this order:
1. **Hard stop** — crash, panic, uncaught exception, process exit, build failure
2. **Dependency / environment blocker** — missing config, secret, DNS, file, service, auth, or connection
3. **Request / runtime failure** — `500`, timeout, rejected promise, queue poison message, parser failure
4. **Fallout** — retries, secondary warnings, repeated health-check failures, broad abort text

Do **not** report 20 repeated downstream lines as 20 different causes.

### Step 5: Correlate and classify
If the evidence spans more than one source, correlate instead of concatenating.

Primary classification buckets:
- `missing-config-or-secret`
- `dependency-or-connection`
- `auth-or-permission`
- `request-or-runtime-error`
- `data-shape-or-validation`
- `resource-or-capacity`
- `browser-network-mismatch`
- `ci-build-test-failure`
- `security-or-suspicious-pattern`
- `unknown-needs-more-context`

Correlation anchors to prefer:
- timestamp window
- request / trace / correlation ID
- job/build ID or CI step
- service / worker / pod / container name
- route, browser action, or API endpoint
- user / tenant / session identifier when safe to mention

### Step 6: Return a triage brief
Default response shape:

```markdown
# Log Triage

## Source
- Packet: app-runtime | container-runtime | browser-plus-api | ci-cascade | structured-json | security-signal
- Environment: local | CI | staging | production | browser | container | pod
- Confidence: high | medium | low

## First actionable failure
- Line or excerpt: `...`
- Why it matters: ...
- Why later lines look secondary: ...

## Pattern / blast radius
- Repeated signature: ...
- Scope: one request | repeated requests | one worker | one deploy window | one environment | broad

## Classification
- Primary bucket: ...
- Secondary bucket: ...

## Likely root cause
- 1-3 sentence explanation grounded in the evidence

## Next read-only checks
1. ...
2. ...
3. ...

## Route-out
- stay in `log-analysis` | `debugging` | `monitoring-observability` | `pattern-detection` | `game-build-log-triage`
```

### Step 7: Route out aggressively
Switch when the next job is no longer first-failure log triage:
- **Reproduction, hypotheses, code/config fixes** → `debugging`
- **Dashboards, alerts, ingestion, telemetry coverage, retention** → `monitoring-observability`
- **Repeated signature hunting across many windows or datasets** → `pattern-detection`
- **Unity / Unreal build/editor/package logs** → `game-build-log-triage`

If the excerpt is too short or starts mid-cascade:
1. mark confidence low
2. ask for the earliest error cluster or 20-80 lines around the first blocker
3. ask for one anchor only if needed: time window, request ID, job/build, pod/container, or browser route
4. do not pretend certainty from a truncated excerpt

## Examples

### Example 1: Container dependency failure
**Prompt:**
> `kubectl logs` shows `Error: connect ECONNREFUSED redis:6379` and then dozens of `job retry failed` lines.

**Good response shape:**
- choose `container-runtime`
- identify the Redis connection failure as the first actionable blocker
- group later retry lines as fallout
- route next to `debugging` or `monitoring-observability` only after the blocker is isolated

### Example 2: Browser + API mismatch
**Prompt:**
> Browser console says `Failed to fetch`, the network tab shows 401 on `/api/session`, and the server log says `JWT audience invalid`.

**Good response shape:**
- choose `browser-plus-api`
- identify backend auth validation as the actionable blocker
- treat browser failure as a symptom, not the cause
- route next to `debugging` once the config/code suspect is clear

### Example 3: CI cascade
**Prompt:**
> CI ends with `test suite aborted`, but earlier there is `ModuleNotFoundError: No module named 'dotenv'`.

**Good response shape:**
- choose `ci-cascade`
- isolate the earliest import failure
- treat the abort/footer text as fallout
- route next to `debugging` after the failing dependency path is known

### Example 4: Automation/webhook JSON logs
**Prompt:**
> These JSON webhook logs show repeated `status=429` retries after one `invalid API key` response. What actually matters?

**Good response shape:**
- choose `structured-json` or `security-signal` depending on whether auth abuse or one bad credential is the primary job
- isolate the first credential/auth failure
- summarize retry volume separately
- route repeated pattern hunting to `pattern-detection` only if the user wants broader anomaly work

## Best practices
1. Choose the **smallest packet** that can answer the question.
2. Lead with the **earliest blocker**, not the loudest line.
3. Group repeated fallout into one signature or blast-radius summary.
4. Correlate browser/network/app evidence instead of summarizing each source independently.
5. Keep all suggested checks **read-only** inside this skill.
6. Treat engine-specific logs as a hard specialist boundary.
7. Route out as soon as the work becomes debugging, observability design, or anomaly hunting.

## References
- `references/intake-packets-and-route-outs.md`
- `references/triage-playbook.md`
- `references/source-boundaries.md`
