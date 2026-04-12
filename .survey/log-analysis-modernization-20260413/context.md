# Context: log-analysis modernization

## Workflow Context
Log analysis repeatedly shows up in three linked lanes:

1. **CLI / developer workflow** — local services, Docker containers, CI jobs, and Kubernetes pods still route through raw log streams (`docker logs`, `kubectl logs`, build output) before a human can isolate the first actionable failure. Sources: Docker Docs (`Logs and metrics`), Kubernetes (`kubectl logs`).
2. **Web development** — frontend incidents frequently require correlating browser console output and network failures with backend/app logs rather than treating each surface separately. Sources: Chrome DevTools Console overview, Chrome DevTools Network overview.
3. **Game-adjacent debugging** — Unity and Unreal both treat editor/runtime/build logs as primary debugging surfaces, but the repo already has `game-build-log-triage` for engine-specific failures. Sources: Unity Console window reference, Unity Log files reference, Unreal Engine logging docs.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend / platform engineer | Triage container, service, pod, and CI logs during failures | Intermediate to advanced |
| Full-stack developer | Correlate browser/network symptoms with server-side logs | Intermediate |
| Incident responder / SRE | Narrow noisy production logs into a likely root cause and next checks | Advanced |
| Support / QA engineer | Attach the right log slice, timestamp, request ID, or session detail for escalation | Intermediate |
| Game developer / build engineer | Distinguish general log triage from engine-specific Unity/Unreal build-log work | Intermediate |

## Current Workarounds
1. `grep` / `rg` / `awk` / `jq` pipelines narrow errors, request IDs, stack traces, or timestamps, but they depend on the user already knowing what to search for.
2. Hosted observability tools narrow time ranges and services, but users still export or copy raw lines into editors, Slack, tickets, or LLM chats to finish the investigation.
3. Browser debugging stays fragmented: console, network waterfall, and server logs are inspected separately unless someone manually correlates them.
4. Game teams fall back to ritualized log reading (editor log, player log, build log, crash log) when the real need is simply to identify the first non-cascading failure and route to the correct specialist skill.

## Adjacent Problems
- Separating **first causal error** from cascade noise in long CI/runtime/editor transcripts.
- Correlating multiple evidence surfaces: logs + traces + deploys + browser/network symptoms.
- Distinguishing **structured log filtering** work from broader observability setup work.
- Avoiding overlap with `debugging`, `monitoring-observability`, and `game-build-log-triage`.
- Turning narrowed log slices into an actionable brief instead of a loose summary.

## User Voices
> "The main uses of the Chrome DevTools Console are logging messages and running JavaScript."  
Source: https://developer.chrome.com/docs/devtools/console/

> "A tutorial on the most popular network-related features in Chrome DevTools."  
Source: https://developer.chrome.com/docs/devtools/network/

> "Unity - Manual: Console window reference" and "Unity - Manual: Log files reference" both frame logs as first-class debugging surfaces rather than optional diagnostics.  
Sources: https://docs.unity3d.com/Manual/Console.html , https://docs.unity3d.com/Manual/LogFiles.html

> "Information on logging in Unreal Engine."  
Source: https://dev.epicgames.com/documentation/en-us/unreal-engine/logging-in-unreal-engine

> `kubectl logs` remains a first-party core workflow for investigating pod output.  
Source: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/

> `lnav` describes itself as "an advanced log file viewer for the small-scale," which is a good signal that many teams still want lightweight, local, investigator-first log triage rather than heavyweight platform work.  
Source: https://lnav.org/
