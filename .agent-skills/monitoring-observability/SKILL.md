---
name: monitoring-observability
description: >
  Design or review observability for services, pipelines, and live operations: instrumentation,
  health signals, dashboards, alerting, retention, and ownership handoffs. Use when the main job
  is deciding what telemetry to emit, which symptoms deserve alerts, how to review dashboard/alert
  coverage, how to make data or marketing pipelines observable, or how to add crash/session visibility
  for game or multi-service systems. Not for root-cause log triage, code-level debugging, or engine-only
  profiler diagnosis — route those to `log-analysis`, `debugging`, `performance-optimization`,
  `langsmith`, or `game-performance-profiler` as appropriate.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, architecture docs, dashboards, alert rules, telemetry configs, runbooks,
  incident follow-ups, and planning tasks where the team needs a repeatable observability setup or
  review workflow rather than vendor-only copy/paste snippets.
metadata:
  tags: observability, monitoring, telemetry, alerts, dashboards, slos, logging, traces, metrics
  version: "2.0"
  source: akillness/oh-my-skills
---

# Monitoring & Observability

Use this skill to turn a vague “we need monitoring” request into a **mode-specific observability brief**.

The goal is **not** to dump a vendor tutorial.
The goal is to decide:
1. what surface needs observability,
2. which signals matter,
3. what should page a human versus stay informational,
4. what ownership or route-out belongs elsewhere.

Read [references/modes-and-boundaries.md](references/modes-and-boundaries.md) before handling mixed requests that blur telemetry setup, log triage, performance diagnosis, or product analytics.
Read [references/alert-dashboard-checklist.md](references/alert-dashboard-checklist.md) when reviewing dashboards, alerts, or SLO coverage.
Read [references/telemetry-rollout-matrix.md](references/telemetry-rollout-matrix.md) when choosing instrumentation, retention, sampling, and ownership defaults.

## When to use this skill
- Set up observability before launch for a web, backend, worker, or multi-service system
- Review whether current metrics, logs, traces, health checks, and alerts are enough
- Design symptom-first alerts, dashboard questions, SLO/SLI coverage, or metamonitoring
- Add telemetry foundations for traces / metrics / logs without tying the workflow to one vendor
- Make product, marketing, analytics, or BI pipelines observable via freshness / schema / volume / lineage checks
- Add crash, alert, and live-ops visibility for game services, builds, or launch events
- Define ownership, retention, or handoff rules after an incident showed telemetry gaps

## When not to use this skill
- **Root-cause triage on existing logs** → use `log-analysis`
- **Code-level reproduction / bug fixing** → use `debugging`
- **Bottleneck diagnosis or tuning after measurements exist** → use `performance-optimization`
- **LLM tracing / evaluation / prompt-observability workflows** → use `langsmith`
- **Unity / Unreal frame-time and profiler-capture interpretation** → use `game-performance-profiler`
- **Release rollout / deploy execution** → use `deployment-automation`

## Mode selection
Choose one primary mode before proposing tooling.

| Mode | Use when | Main output |
|------|----------|-------------|
| Service reliability | API/app/worker/service needs health signals, SLOs, dashboards, alerts | service observability brief |
| Telemetry foundation | team needs instrumentation, event naming, traces/metrics/logs coverage | telemetry rollout plan |
| Data / pipeline observability | analytics, marketing, BI, or data pipelines need reliability checks | data-health monitoring brief |
| Game / live-ops visibility | crashes, player-session health, launch-event stability, backend game services | live-ops observability brief |
| Review / gap audit | existing stack exists but trust is low or incidents escaped detection | observability review + gap list |

If multiple modes appear, pick the primary bottleneck and list the others as secondary follow-ups.

## Instructions

### Step 1: Label the surface before choosing tools
Capture the minimum facts first.

Record:
- system type: web app | backend/API | worker/job | data pipeline | marketing automation | game/live-ops | mixed
- environment: local | staging | preview | prod | launch-event | unknown
- request type: new setup | review / audit | incident follow-up | migration | platform/tool switch
- current evidence: metrics | logs | traces | dashboards | alert rules | incidents | none
- user impact shape: latency | errors | stale data | missing events | crashes | unknown
- ownership: app team | platform/SRE | data/ops | live-ops | shared | unknown

Do **not** start by asking “Prometheus or Datadog?” Start by labeling the workflow.

### Step 2: Choose the primary observability mode

#### Mode A — Service reliability
Use when the core job is service health, paging, and user-visible behavior.

Focus on:
- request rate / traffic shape
- error rate / failure class
- latency distribution / saturation
- black-box probes and metamonitoring
- SLO / SLI definitions for important journeys

Return:
- top 3–5 service questions the dashboard must answer
- symptom-first alerts only
- what must page now vs ticket later vs dashboard only
- missing instrumentation or health endpoints

#### Mode B — Telemetry foundation
Use when the team needs to instrument the system, correlate signals, or standardize telemetry.

Focus on:
- traces, metrics, logs, and correlation IDs
- event naming / dimensions / labels
- instrumentation ownership and rollout slices
- retention / sampling / cardinality risk
- vendor-neutral export path first, backend second

Return:
- telemetry coverage map
- required correlation fields (`request_id`, `trace_id`, `job_id`, `user_id`, etc.)
- initial rollout order
- unsafe telemetry patterns to avoid

#### Mode C — Data / pipeline observability
Use when freshness, schema drift, volume anomalies, or broken downstream dashboards are the real issue.

Focus on:
- freshness / lateness
- volume / duplicates / drops
- schema drift
- distribution / null rate / metric anomalies
- lineage / downstream blast radius

Return:
- the most important pipeline-health dimensions
- likely owners for each alert class
- where dashboard trust can silently break
- which checks are table-level, job-level, and consumer-level

#### Mode D — Game / live-ops visibility
Use when player experience, launch stability, or cross-build crash visibility matters.

Focus on:
- crash reporting and issue grouping
- build / version / platform tags
- player-session and backend-service health
- launch-event alert thresholds
- logs / breadcrumbs / device context / purchase-session context where relevant

Return:
- live-ops event checklist
- crash/context fields that must be attached
- which signals belong in backend telemetry vs crash tooling
- route-out to `game-performance-profiler` if the issue becomes frame-time profiling

#### Mode E — Review / gap audit
Use when dashboards, alerts, or tooling exist but confidence is low.

Focus on:
- what incidents would still escape detection
- noisy / non-actionable alerts
- dashboards with no clear question or owner
- missing black-box coverage / metamonitoring
- orphan telemetry that nobody uses

Return:
- keep / fix / delete / add decisions
- top false-positive and false-negative risks
- ownership gaps
- smallest high-value remediation order

### Step 3: Build the observability brief
Return a concise report with this shape:

```markdown
# Observability Brief

## Scope
- System type: ...
- Environment: ...
- Primary mode: ...
- Confidence: high | medium | low

## Current signal state
- What exists already
- What is missing or unreliable

## Primary questions to answer
- 3-5 questions dashboards / alerts must answer

## Signal plan
- Metrics: ...
- Logs: ...
- Traces: ...
- Black-box / health checks: ...

## Alert policy
- Page now: ...
- Ticket / backlog: ...
- Dashboard only: ...

## Ownership and handoffs
- Primary owner: ...
- Route-outs: ...

## First implementation slice
- 1-3 smallest high-value changes
```

### Step 4: Apply symptom-first alert rules
Use these defaults unless the evidence says otherwise.

- Alert on **user-visible symptoms** before internal causes
- Prefer **one clear page** over many stack-layer pages for the same failure
- Include **runbook/dashboard links** in alert context
- Add **slack** for brief blips; avoid paging for self-healing noise
- Metamonitor the monitoring path itself when alert delivery is mission-critical

Good examples:
- sustained API error-rate spike affecting user requests
- stale data beyond the business tolerance window
- launch-event crash rate above threshold by platform/build
- message backlog age causing downstream user-visible delay

Weak examples:
- every 5xx at every layer
- every restart with no impact
- every metric anomaly without action
- alerts nobody can own

### Step 5: Pick the right evidence surface
Do not recommend one surface for every problem.

- **Metrics** for rate, latency, capacity, saturation, freshness age, backlog age
- **Logs** for context and event details once symptoms are detected
- **Traces** for request flow and dependency boundaries
- **Black-box checks** for externally visible health
- **Dashboards** for ongoing review, not as the only alert mechanism
- **Issue/crash tools** for grouped error context, breadcrumbs, and release/build impact

If the system only has logs, say so clearly and mark observability maturity as limited.

### Step 6: Make route-outs explicit
When the job shifts, hand it off.

- **“Find the actual failing line in these logs”** → `log-analysis`
- **“We already know latency is bad; find the bottleneck”** → `performance-optimization`
- **“This looks like a code bug, not a telemetry design issue”** → `debugging`
- **“LLM trace quality / evals / prompt observability”** → `langsmith`
- **“Unity/Unreal frame-time capture interpretation”** → `game-performance-profiler`
- **“Deploy/release plan with post-deploy checks”** → `deployment-automation`

## Examples

### Example 1: New API before launch
**Prompt:**
> We’re launching a new API next week. Tell me what to instrument and what should alert us.

Use **Mode A — Service reliability** plus a small **Mode B** foundation slice.
Return rate/error/latency/saturation questions, minimal tracing fields, black-box checks, and symptom-first alert thresholds.

### Example 2: Marketing dashboard keeps going stale
**Prompt:**
> Our Monday morning growth dashboard is stale half the time. We need observability, not another manual spreadsheet check.

Use **Mode C — Data / pipeline observability**.
Return freshness/schema/volume/lineage checks, ownership by pipeline/job/dashboard layer, and alert thresholds tied to business tolerance windows.

### Example 3: Game launch-event visibility
**Prompt:**
> We need crash alerts and player-session visibility for our Unity event weekend, but this isn’t a profiler question yet.

Use **Mode D — Game / live-ops visibility**.
Return crash/build/platform tags, session-health metrics, launch alert levels, and route-outs to `game-performance-profiler` only if frame-time evidence becomes the bottleneck.

### Example 4: Boundary check
**Prompt:**
> Here are the logs from the outage — what’s the root cause?

Do **not** use this as the main workflow. Route to `log-analysis` and say observability improvements can be proposed after the first actionable failure is identified.

## Best practices
1. Start with the workflow shape, not the vendor choice.
2. Prefer symptom-first alerts with low noise.
3. Distinguish instrumentation gaps from incident diagnosis.
4. Treat data/marketing pipeline observability as first-class, not as an afterthought.
5. For games, separate live-ops visibility from engine profiler interpretation.
6. Make owners and handoffs explicit, especially after incidents.
7. Keep dashboards question-driven; delete dead dashboards and dead alerts.
8. Call out missing metamonitoring when alert delivery itself can fail.

## References
- [Google SRE — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenTelemetry — Observability primer](https://opentelemetry.io/docs/concepts/observability-primer/)
- [Prometheus — Alerting best practices](https://prometheus.io/docs/practices/alerting/)
- [Grafana — What is observability?](https://grafana.com/blog/what-is-observability-best-practices-key-metrics-methodologies-and-more/)
- [Databricks — What is Data Observability?](https://www.databricks.com/blog/what-is-data-observability)
- [Sentry — Game developers](https://sentry.io/solutions/game-developers/)
