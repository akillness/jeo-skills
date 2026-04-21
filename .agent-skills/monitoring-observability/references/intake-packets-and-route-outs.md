# Intake Packets and Route-Outs

Start from the packet the user already has. Do not force a vendor or telemetry-stack discussion before classifying the evidence surface.

## Service / reliability packet
Use when the packet is an architecture note, health check list, SLO draft, recent outage summary, or launch-readiness review for an API/app/worker.

Look for:
- user-visible journeys that matter
- one RED / golden-signals view per service
- paging thresholds vs ticket-only thresholds
- black-box checks and metamonitoring
- missing runbook / owner links

Route out when:
- the real task is release execution or rollback sequencing → `deployment-automation`
- the packet is already a bottleneck trace / query plan / profiler artifact → `performance-optimization`

## Telemetry-foundation packet
Use when the packet is instrumentation debt, event naming drift, trace/log/metric gaps, or a migration between telemetry backends.

Look for:
- correlation fields (`trace_id`, `request_id`, `job_id`, `build`, `region`)
- bounded labels and cardinality risk
- retention and sampling defaults
- rollout slices by team / service / pipeline
- ownership for maintaining telemetry contracts

Route out when:
- the ask is AI/LLM trace quality, evals, or prompt observability → `langsmith`
- the task is generic environment/bootstrap setup rather than telemetry decisions → `system-environment-setup`

## Data / pipeline packet
Use when the packet is a stale dashboard complaint, broken marketing report, warehouse job alert, freshness issue, or schema-drift concern.

Look for:
- freshness / lateness windows
- schema / contract drift
- volume, duplicate, or null-rate anomalies
- lineage / downstream blast radius
- which team owns the consumer-facing dashboard

Route out when:
- the main job is KPI interpretation, experiment readout, or stakeholder explanation → `data-analysis`
- the main job is report/dashboard presentation design on top of trusted BigQuery data → `looker-studio-bigquery`

## Review / audit packet
Use when teams already have dashboards and alerts but trust is low.

Look for:
- noisy pages with no action
- dead dashboards or duplicated panels
- missing black-box coverage or metamonitoring
- alerts with no owner, runbook, or dashboard link
- keep / fix / delete / add decisions

Route out when:
- the packet is a pile of logs and the real ask is first actionable failure → `log-analysis`
- the packet is a code regression hunt rather than telemetry review → `debugging`

## Game / live-ops packet
Use when the packet is launch-event readiness, crash visibility, backend health for a live event, or session/build/platform monitoring.

Look for:
- build / version / platform tags
- crash grouping and attached device/session context
- player-facing thresholds vs investigation-only thresholds
- session / matchmaking / purchase / backend health panels
- launch war-room dashboard and escalation ownership

Route out when:
- the main job is frame-time / CPU/GPU capture interpretation → `game-performance-profiler`
- the main job is Steam store timing / launch-page operations rather than telemetry → `steam-store-launch-ops`
