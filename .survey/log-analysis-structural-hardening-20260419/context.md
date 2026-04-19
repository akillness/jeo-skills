# Context: log-analysis structural hardening

## Workflow Context
`log-analysis` gets invoked when a user has noisy evidence but not yet a clear diagnosis: container or pod logs in CLI/dev loops, browser-plus-API failures in web apps, CI transcript cascades, queue/worker errors in ops and marketing automation systems, or mixed runtime excerpts that need the first actionable blocker instead of a line-by-line retelling.

Across these workflows, people still bounce between raw terminal filtering (`rg`, `jq`, `kubectl logs`, `docker logs`), browser devtools, CI log viewers, and product logs rather than staying in one observability product. That makes the front-door decision more important than encyclopedic tool coverage.

Relevant primary references used in this run:
- Docker Docs — Logs and metrics: https://docs.docker.com/engine/logging/
- Kubernetes docs — `kubectl logs`: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/
- Chrome DevTools — Console overview: https://developer.chrome.com/docs/devtools/console/
- Chrome DevTools — Inspect network activity: https://developer.chrome.com/docs/devtools/network/
- GitHub Actions — workflow run logs: https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/using-workflow-run-logs
- Unity Manual — Log files reference: https://docs.unity3d.com/Manual/log-files.html

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| CLI/dev operator | Narrow container, worker, or service logs to the first blocker | Intermediate |
| Web/fullstack engineer | Correlate browser/network symptoms with backend evidence | Intermediate |
| PM/ops or automation owner | Triage queue, ETL, integration, or workflow failures before escalating | Mixed |
| Marketing / GTM automation owner | Inspect campaign, sync, webhook, or CRM pipeline failures without building dashboards first | Mixed |
| Game-adjacent maintainer | Separate generic runtime logs from Unity/Unreal specialist build/editor/package logs | Mixed |

## Current Workarounds
1. Start with broad regex/grep over the whole file, then manually scroll for the earliest hard stop.
   - Limitation: often overweights downstream noise and repeated fallout.
2. Correlate browser console, network, API, and worker logs by memory instead of with an explicit evidence packet.
   - Limitation: mixed-source incidents get summarized as disconnected symptoms.
3. Treat CI logs as one giant failure transcript.
   - Limitation: generic abort lines hide the first actionable import/config/runtime error.
4. Push every log-heavy request toward debugging or observability setup immediately.
   - Limitation: users often need read-only triage first, not code hypotheses or monitoring design.
5. Let generic log skills absorb Unity/Unreal-specific build/editor/package logs.
   - Limitation: engine-specific workflows have specialist boundaries that general log triage should not blur.

## Adjacent Problems
- `debugging` overlap appears when the skill tries to propose fixes before the likely blocker is isolated.
- `monitoring-observability` overlap appears when the request is really about instrumentation, dashboards, alerting, or retention instead of raw log triage.
- `game-build-log-triage` overlap appears when engine-specific logs are treated as generic runtime output.
- `pattern-detection` overlap appears when repeated signatures and anomaly grouping become the main job instead of first-failure triage.

## User Voices
> “The main uses of the Chrome DevTools Console are logging messages and running JavaScript.” — Chrome DevTools Console overview (https://developer.chrome.com/docs/devtools/console/)

> “A tutorial on the most popular network-related features in Chrome DevTools.” — Chrome DevTools Network overview (https://developer.chrome.com/docs/devtools/network/)

> “You can view, search, and download the logs for each job in a workflow run.” — GitHub Actions workflow run logs (https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/using-workflow-run-logs)

> `kubectl logs` remains a first-class operator surface, which reinforces that log triage often starts from raw command output rather than a full observability platform. — Kubernetes docs (https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)

> Unity documents log-file locations separately, reinforcing that engine build/editor/package logs deserve a dedicated specialist route-out instead of living inside a generic log skill. — Unity Manual, Log files reference (https://docs.unity3d.com/Manual/log-files.html)
