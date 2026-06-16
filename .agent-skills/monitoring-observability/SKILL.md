---
name: monitoring-observability
description: >
  Route observability work from the current packet into one monitoring brief.
  Use when the main job is deciding service-health signals, telemetry rollout,
  dashboard/alert coverage, pipeline freshness/schema monitoring, or game
  live-ops visibility; choosing between service reliability, telemetry
  foundation, review audit, data/pipeline, and live-ops modes; and naming one
  smallest implementation slice. Route outage-log root cause to `log-analysis`,
  code-level failure isolation to `debugging`, bottleneck tuning to
  `performance-optimization`, rollout execution to `deployment-automation`,
  LLM-specific tracing to `langsmith`, and engine-profiler interpretation to
  `game-performance-profiler`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories, architecture notes, alert rules, dashboard inventories,
  telemetry configs, incident follow-ups, data-pipeline docs, and launch
  checklists where the real decision is what to measure, what should alert a
  human, who owns the signal, and what work belongs in a neighboring skill.
metadata:
  tags: observability, monitoring, telemetry, alerts, dashboards, slos, logging, traces, metrics
  version: "2.1"
  source: akillness/jeo-skills
---

# Monitoring & Observability

Use this skill when the main question is **"what packet do we have, what should this system notice, and what should interrupt a human?"**

The job is not to dump a Prometheus / Grafana / Datadog tutorial.
The job is to normalize the packet, pick one primary observability mode, define the smallest useful signal plan, and route adjacent work away before the skill turns into debugging, performance tuning, rollout execution, or analytics reporting.

Read [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) before handling an unfamiliar packet.
Read [references/modes-and-boundaries.md](references/modes-and-boundaries.md) before handling mixed requests that blur telemetry setup, incident diagnosis, or product analytics.
Read [references/alert-dashboard-checklist.md](references/alert-dashboard-checklist.md) when reviewing dashboards, alerts, and ownership gaps.
Read [references/telemetry-rollout-matrix.md](references/telemetry-rollout-matrix.md) when choosing the smallest rollout slice.

## When to use this skill
- New service, worker, API, or multi-service system needs health signals, alerts, dashboards, or SLO-style coverage before launch
- Existing stack has dashboards / alerts / telemetry, but trust is low and a keep/fix/delete/add audit is needed
- Team needs to decide what to instrument, correlate, retain, or sample before choosing vendors or backend specifics
- Data, marketing, analytics, or pipeline work needs freshness / schema / volume / lineage monitoring rather than another manual trust check
- Game or live-ops work needs crash, session, build, or launch-event visibility without turning into engine-profiler interpretation
- Cross-functional reliability asks span backend, product/ops, marketing pipelines, and game live-ops, and the next owner is still unclear

## When not to use this skill
- **The packet is mainly logs and the job is finding the first actionable failure** → `log-analysis`
- **The job is reproduce → isolate → verify for a code bug or regression** → `debugging`
- **Measurements already exist and the main job is naming a bottleneck or tuning it** → `performance-optimization`
- **The main job is release execution, promotion, rollback, or post-deploy sequencing** → `deployment-automation`
- **The work is LLM-specific traces, evals, or prompt-observability** → `langsmith`
- **The work is Unity/Unreal/Godot frame-time capture interpretation** → `game-performance-profiler`
- **The task is pure dashboard/report presentation on curated BigQuery data** → `looker-studio-bigquery`

## Instructions

### Step 1: Frame the packet
Record the smallest useful intake statement before recommending tooling.

Capture:
- surface: service/API | worker/queue | data/pipeline | dashboard/audit | game/live-ops | mixed | unknown
- request type: new setup | review/audit | incident follow-up | migration | launch readiness | unknown
- current packet: architecture note | alert rules | dashboard inventory | incident summary | telemetry config | stale-report complaint | crash/session brief | none
- user/business impact: latency | errors | stale data | missing visibility | crash/session risk | noisy pages | unknown
- ownership: app team | platform/SRE | data/ops | live-ops | shared | unknown

Quick frame:
```markdown
Surface: data/pipeline
Request type: review/audit
Current packet: stale dashboard complaint + job ownership notes
Impact: stale data and trust erosion
Ownership: data/ops + dashboard consumer owner
```

### Step 2: Start from the intake packet
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Choose the packet the user actually has now:
- service / reliability packet
- telemetry-foundation packet
- data / pipeline packet
- review / audit packet
- game / live-ops packet
- no usable packet yet

Output this step as:
```markdown
## Intake Packet
- Current packet:
- Why it is enough (or not enough):
- Missing context to collect next:
```

Rule: do not force a vendor comparison or telemetry-stack rewrite if the current packet already narrows the next decision.

### Step 3: Choose one primary observability mode
Pick one primary mode from [references/modes-and-boundaries.md](references/modes-and-boundaries.md).

Primary modes:
- `service-reliability`
- `telemetry-foundation`
- `data-pipeline-observability`
- `game-liveops-visibility`
- `review-gap-audit`
- `unknown-needs-better-packet`

Rule: one primary mode, optional secondary mode.
Do not blend launch telemetry, stale dashboard audits, crash visibility, and generic instrumentation into one answer.

### Step 4: Name the core monitoring question
Before listing tools or metrics, state what the system must answer.

Good examples:
- “Would user-visible API pain page us before customers report it?”
- “Do we know when Monday’s growth dashboard is stale, why it is stale, and who owns the fix?”
- “Can launch-event crashes be grouped by build/platform and escalated before social reports spike?”
- “Do current alerts point responders to one useful dashboard/runbook instead of three noisy symptoms?”

Avoid vague statements like “set up better monitoring.”

### Step 5: Build one smallest signal plan
Use [references/telemetry-rollout-matrix.md](references/telemetry-rollout-matrix.md).

For the chosen mode, define:
- primary questions the dashboard / alert path must answer
- evidence surfaces: metrics, logs, traces, black-box checks, crash tooling, freshness checks, lineage views
- page now vs ticket later vs dashboard-only thresholds
- owner for each alert or dashboard family
- the first 1–3 implementation slices only

Rules:
- Alert on symptoms before internal causes.
- Prefer one clear page over many stack-layer pages for the same incident.
- Keep labels bounded; push high-cardinality detail into logs/traces.
- Include runbook/dashboard links whenever an alert expects human action.
- Treat metamonitoring as first-class when alert delivery can fail silently.

### Step 6: Make route-outs explicit
Hand work off when the job shifts.

Common route-outs:
- root-cause log forensics → `log-analysis`
- correctness-first regression hunt → `debugging`
- bottleneck diagnosis or tuning → `performance-optimization`
- release execution / post-deploy rollback path → `deployment-automation`
- LLM tracing / evals / prompt observability → `langsmith`
- KPI interpretation / stakeholder evidence summary → `data-analysis`
- BigQuery-backed dashboard presentation layer → `looker-studio-bigquery`
- engine-profiler interpretation → `game-performance-profiler`

### Step 7: Return the observability brief
```markdown
# Observability Brief

## Scope
- Surface:
- Request type:
- Intake packet:
- Primary mode:
- Confidence:

## Core Monitoring Question
- ...

## Signal Plan
- Metrics / checks:
- Logs / traces / crash context:
- Dashboards / views:
- Alert policy:

## Ownership
- Primary owner:
- Secondary owner(s):

## First Implementation Slice
1. ...
2. ...
3. ...

## Route-outs
- ...
```

## Examples

### Example 1: New API before launch
**Input:** “We’re launching a new API next week. Tell me what to instrument and what should page us.”

**Expected shape:** classify as `service-reliability`, use the current launch/readiness packet, define RED / golden-signals questions plus black-box coverage, page thresholds, and one smallest rollout slice.

### Example 2: Growth dashboard keeps going stale
**Input:** “Our Monday morning growth dashboard is stale half the time. We need observability, not another spreadsheet check.”

**Expected shape:** classify as `data-pipeline-observability`, cover freshness/schema/volume/lineage/ownership, and distinguish dashboard trust checks from KPI interpretation work.

### Example 3: Review / gap audit
**Input:** “We have tons of alerts and dashboards, but nobody trusts them. What should we keep versus delete?”

**Expected shape:** classify as `review-gap-audit`, use the alert/dashboard checklist, produce keep/fix/delete/add decisions, and call out noisy pages, ownerless panels, and missing metamonitoring.

### Example 4: Route-out to rollout execution
**Input:** “We just deployed and need a step-by-step rollback/promotion checklist with health checks.”

**Expected shape:** route the execution workflow to `deployment-automation`, while optionally noting the few post-deploy observability questions that matter.

### Example 5: Route-out to log forensics
**Input:** “Here are the outage logs. Find the root cause.”

**Expected shape:** do not use this as the main workflow; route to `log-analysis` and only propose observability follow-up after the first actionable failure is identified.

## Best practices
1. Start with the packet and core monitoring question, not the vendor.
2. Keep one primary mode and one smallest implementation slice.
3. Alert on symptoms, not every possible cause.
4. Make ownership, runbooks, and dashboard links explicit.
5. Treat stale data / pipeline trust as first-class observability work.
6. Separate game live-ops visibility from engine-profiler interpretation.
7. Keep review/audit work honest: dead dashboards and noisy alerts should be deleted, not merely documented.
8. Sync compact discovery surfaces whenever the front-door boundary changes.

## References
- [Google SRE — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenTelemetry — Observability primer](https://opentelemetry.io/docs/concepts/observability-primer/)
- [Prometheus — Alerting](https://prometheus.io/docs/practices/alerting/)
- [Grafana — Dashboard best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/)
