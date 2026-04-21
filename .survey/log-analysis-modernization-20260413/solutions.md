# Solution Landscape: log-analysis modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Datadog Logs | Hosted centralized log search + correlation | Strong search/correlation defaults, popular ops mental model | Cost and retention/index complexity | Good reference for correlation workflow, not for a local read-first skill |
| Grafana Loki | Label-based centralized logs | Common in Kubernetes/cloud-native teams, cost-aware | Query/cardinality complexity | Good reference for label/time-window narrowing |
| Elastic / ELK | Search-heavy centralized logging | Powerful indexing and dashboards | Operational overhead | Useful model for field-first investigation |
| Better Stack / Papertrail / SigNoz | Simpler hosted log search | Fast onboarding, smaller-team appeal | Less depth than large suites | Relevant as "search first, investigate locally" products |
| Sentry / LogRocket | Error/session-adjacent evidence | Add replay, stack traces, release context | Not a full raw-log replacement | Important adjacent evidence, not the main skill job |
| lnav | Local terminal log navigation | Investigator-first, low setup, good for local slices | Small-scale tool, not cross-surface reasoning | Closest product analog to a read-only analysis helper |
| stern / kubectl logs / docker logs | Raw stream tailing and scoping | Ubiquitous, low friction | Still leaves manual pattern extraction to the human | Strong evidence that CLI-first log triage remains universal |
| Unity / Unreal built-in logs | Engine-native debugging surfaces | Authoritative for editor/runtime/build logs | Engine-specific noise, multiple log classes | Should remain outside the general skill when engine-specific triage is needed |

## Categories
- **Centralized observability**: Datadog, Loki, Elastic, Better Stack, SigNoz, Papertrail
- **Local investigator tools**: lnav, jq, ripgrep, stern, `kubectl logs`, `docker logs`
- **Adjacent evidence tools**: Sentry, LogRocket, traces/metrics correlation
- **Engine-native specialist surfaces**: Unity logs, Unreal logging

## What People Actually Use
People usually combine a hosted search surface with local/manual investigation:
- narrow by service, pod, request ID, or time window in a UI
- export or copy raw lines
- run `rg`, `jq`, `sort | uniq -c`, or ad hoc scripts
- paste narrowed excerpts into an LLM for summarization or next-command suggestions
- reproduce with extra verbosity if the first pass is inconclusive

## Frequency Ranking
1. Hosted centralized logs (Datadog / Loki / Elastic mental model)
2. Raw CLI streams (`kubectl logs`, `docker logs`, CI output)
3. Local text shaping (`rg`, `jq`, `awk`, `lnav`)
4. Adjacent evidence (Sentry, LogRocket, traces/metrics)
5. Engine-native build/runtime logs for game work

## Key Gaps
- Existing tools help **locate** relevant logs, but they do not reliably produce a short root-cause-first brief.
- Humans still have to separate the first causal failure from repeated downstream noise.
- Browser/network/app logs remain fragmented unless somebody explicitly correlates them.
- Game-adjacent work needs a clean handoff boundary so the general skill does not absorb Unity/Unreal specialist triage.

## Contradictions
- Marketed observability tools promise unified diagnosis, but real behavior still falls back to shell filtering, copy-paste, and one-off scripts.
- Local tools like `lnav` and `jq` are practical and common, but they assume the operator already knows which slice or fields matter.
- A general log skill is useful across many domains, but it becomes noisy and duplicative if it tries to absorb engine-specific build-log expertise already covered elsewhere.

## Key Insight
The highest-leverage modernization is not adding another logging/observability skill. It is rewriting `log-analysis` into a **read-only root-cause triage skill** that starts with source identification, narrows to the first actionable failure, groups recurring evidence, and then routes outward: `debugging` for code fixes, `monitoring-observability` for pipeline/setup work, and `game-build-log-triage` for Unity/Unreal-specific build/editor/package logs.
