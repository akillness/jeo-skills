# Solution Landscape: log-analysis structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `kubectl logs` | Direct command-line log retrieval | Fastest path to pod/container evidence; easy time-window narrowing | Raw output is noisy; no built-in root-cause summary | Canonical CLI/operator workflow |
| Docker logging surface | Container log retrieval and driver guidance | Ubiquitous runtime source; grounded in real deploy workflows | Still leaves interpretation to the operator | Supports the “raw evidence first” packet |
| Chrome DevTools Console + Network | Browser + request evidence correlation | Strong for frontend/network symptoms and mixed browser/API incidents | Easy to over-focus on client symptoms without backend correlation | Best source for `browser-plus-api` packet |
| GitHub Actions workflow run logs | CI transcript search/download | Realistic source for build/test/install cascades | Easy to mistake generic abort lines for the root cause | Best source for `ci-cascade` packet |
| Generic observability platforms | Search, dashboards, and retained telemetry | Great for ongoing monitoring, cross-host search, and alerts | Too broad when the user only needs the first actionable blocker in a pasted excerpt | Route-out, not default entrypoint |
| Engine-specific log docs/tools | Unity/Unreal editor/build/package specialists | Rich engine context and correct boundary handling | Wrong abstraction for generic app/API/CI logs | Confirms `game-build-log-triage` route-out |

## Categories
- **Raw operator surfaces:** `kubectl logs`, Docker log retrieval, CI run logs
- **Mixed evidence surfaces:** browser console + network + server/API logs
- **Long-lived telemetry products:** observability/search platforms that help after the triage packet is known
- **Specialist route-outs:** Unity/Unreal build/editor/package log handling

## What People Actually Use
In practice, maintainers still mix raw retrieval plus small filters before they escalate:
- command output (`kubectl logs`, `docker logs`, CI log download)
- browser console/network panels for client symptoms
- lightweight grouping/filtering (`rg`, `jq`, request IDs, timestamps)
- only then a route-out to debugging, observability, or specialist engine triage

That real behavior argues for a smaller packet router, not a longer tutorial.

## Frequency Ranking
1. Raw command-line or CI log surfaces
2. Browser console/network plus backend evidence correlation
3. Observability platform search after the initial blocker is known
4. Specialist game-engine log handling as an explicit route-out

## Key Gaps
- Existing products and docs teach surfaces well, but they do not normalize the agent-side decision of **which log packet to run first**.
- Generic log-analysis content easily drifts into debugging, monitoring setup, or anomaly hunting unless boundaries stay explicit.
- Mixed browser/API incidents and CI cascades need stronger front-door packet language than a broad “analyze logs” description.

## Contradictions
- Marketed observability breadth suggests one product can do everything, but real workflows still begin with raw excerpts and read-only narrowing.
- Browser tooling highlights client evidence, but the actionable cause often lives in backend auth/config/runtime logs.
- Generic log-analysis skills promise wide coverage, yet game-engine logs still need a specialist route-out.

## Key Insight
The durable improvement is not adding another log wrapper. It is shrinking `log-analysis` into a routing-first skill that chooses one evidence packet — for example `app-runtime`, `browser-plus-api`, `ci-cascade`, `structured-json`, or `security-signal` — then routes diagnosis, monitoring design, pattern hunting, or engine-specific follow-up to the correct adjacent skill as soon as log triage stops being the bottleneck.
