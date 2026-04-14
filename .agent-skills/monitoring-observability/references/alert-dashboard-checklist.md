# Alert and Dashboard Checklist

Use this when reviewing an existing observability setup.

## Alert quality
- What exact user-visible or business-visible symptom does this alert represent?
- Is there a clear owner who can act when it fires?
- Should this be a page, a ticket, or dashboard-only information?
- Does the alert tolerate short blips and self-healing behavior?
- Does it include a dashboard, runbook, or query link for first response?
- Are multiple stack-layer alerts duplicating the same incident?
- Would the team regret being woken up by this at 3am?

## Dashboard quality
- What decision or question is this dashboard meant to support?
- Is there an owner who maintains thresholds and panel relevance?
- Are the key service questions visible without scrolling through noise?
- Does the dashboard separate symptom panels from deep-dive drilldown panels?
- Are deploy/build/version markers visible when changes often trigger incidents?
- Is stale or unused telemetry being graphed just because it exists?

## Data / pipeline checks
- Freshness / lateness window defined?
- Schema-drift detection present?
- Volume / duplicate / null-rate anomalies covered?
- Lineage / downstream blast-radius view available?
- Dashboard consumers know which table/job owns each alert?

## Game / live-ops checks
- Crash reports tagged by build, platform, region, and game mode?
- Session / matchmaking / purchase / backend health visible during events?
- Alerts separated between player-facing severity and internal investigation noise?
- Breadcrumbs, logs, or device context attached to critical issues?

## Metamonitoring
- Do we know if the telemetry pipeline itself is down?
- Are alert delivery and black-box probes monitored independently?
- Could the current setup fail silently?
