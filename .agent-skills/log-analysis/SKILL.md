---
name: log-analysis
description: >
  Triage application, infrastructure, browser, API, CI, and general runtime logs
  into the first actionable failure, repeated patterns, likely scope, and next
  read-only checks. Use when the user shares raw log text, access/error logs,
  JSON logs, stack traces, pod/container output, browser console or network
  errors, or says things like "check the logs", "what is the real error here",
  "find the root cause", "why is CI failing", or "which lines actually matter".
  Not for Unity/Unreal build/editor/package logs when `game-build-log-triage`
  is the better specialist.
allowed-tools: Bash Read Grep Glob
compatibility: >
  Best for repositories, incidents, or pasted excerpts where the main task is
  read-only log triage rather than observability platform setup or code changes.
metadata:
  tags: logs, triage, debugging, observability, incidents, ci, browser, grep
  version: "2.0"
  source: akillness/oh-my-skills
---

# Log Analysis

Use this skill to turn noisy logs into a short, root-cause-first debugging brief.

The job is **not** to paraphrase every line.
The job is to identify:
1. the most relevant log source,
2. the first actionable failure or deviation,
3. the repeated pattern or blast radius,
4. the safest next checks.

Read [references/triage-playbook.md](references/triage-playbook.md) before handling unfamiliar mixed log sets.
Read [references/source-boundaries.md](references/source-boundaries.md) when you need to decide whether this skill, `debugging`, `monitoring-observability`, or `game-build-log-triage` should own the request.

## When to use this skill
- Application, API, worker, reverse-proxy, or infrastructure log triage
- CI logs where the user wants the first real blocker instead of a wall of output
- Browser console or network failures that need correlation with server-side evidence
- JSON/text log slices that need grouping, deduplication, or timestamp/request-ID narrowing
- Incident review where the user asks for the likely root cause and next read-only checks
- Repeated errors where the user needs the pattern summarized into a short brief

## When not to use this skill
- **Unity / Unreal build, cook, package, editor, or player logs** → use `game-build-log-triage`
- **Observability stack setup, ingestion pipelines, alerting, dashboards, retention, or instrumentation** → use `monitoring-observability`
- **General code debugging after the likely cause is already known** → use `debugging`

## Instructions

### Step 1: Identify the log surface and time window
Classify the material before analyzing it.

**Typical sources**
- `application.log`, worker logs, background-job output
- `access.log`, `error.log`, proxy/server logs
- `docker logs`, `kubectl logs`, CI transcript, test-runner output
- browser console errors, browser network failures, SSR/dev-server output
- JSON logs with structured fields like `level`, `service`, `request_id`, `trace_id`, `user_id`

Record these first:
- source type
- environment: local / CI / staging / production / browser / container / pod
- approximate failing time window
- whether the failure is one-off or repeated
- whether the excerpt looks complete or truncated

If the log source is Unity or Unreal specific, stop and route to `game-build-log-triage`.

### Step 2: Find the first actionable failure
Work top-down. Prefer the earliest line that changes the system state or clearly blocks progress.

Use this order:
1. **Fatal / hard stop** — crash, panic, uncaught exception, process exit, build failure
2. **Dependency or environment blocker** — missing file, missing env var, auth failure, DNS/connection failure, config mismatch
3. **Request or runtime failure** — `500`, timeout, rejected promise, stack trace, retry storm, queue poison message
4. **Noise / fallout** — repeated retries, secondary exceptions, cascading warnings, repeated health-check failures

Do **not** report 12 repeated downstream lines as 12 separate causes.

### Step 3: Narrow the slice before interpreting it
Use read-only filters to isolate the smallest useful evidence set.

**Text logs**
```bash
rg -n "error|exception|fatal|panic|failed|timeout|traceback" app.log
rg -n -C 3 "request_id=abc123|trace_id=abc123|job_id=42" app.log
rg -n " 5[0-9][0-9] | HTTP/.* 5[0-9][0-9] | status=500" access.log
```

**JSON logs**
```bash
jq -c 'select(.level == "error")' app.jsonl
jq -c 'select(.request_id == "abc123")' app.jsonl
jq -r '[.timestamp, .level, .service, .message] | @tsv' app.jsonl
```

**Frequency / repeated signatures**
```bash
rg -o "[A-Z][A-Za-z]+Exception|panic: .*|ERROR.*" app.log | sort | uniq -c | sort -rn | head
jq -r '.message // empty' app.jsonl | sort | uniq -c | sort -rn | head
```

**Time-window slicing**
```bash
rg "2026-04-13T01:0[3-6]:" app.log
rg "\[13/Apr/2026:01:0[3-6]:" access.log
```

### Step 4: Correlate across nearby evidence surfaces
If the failure spans more than one source, correlate instead of treating each source independently.

Common pairs:
- browser console ↔ network failures ↔ app/API logs
- proxy/access logs ↔ app error logs ↔ worker/job logs
- pod/container logs ↔ deploy/restart timing ↔ recent config change
- CI transcript ↔ test failure excerpt ↔ compiler/runtime stack trace

Prefer these anchors when available:
- timestamp window
- request ID / trace ID / correlation ID
- job/build ID
- service name / container / pod / host
- user/session/tenant identifier (masked if sensitive)

### Step 5: Classify the failure bucket
Choose one primary bucket and optionally one secondary bucket.

**Primary buckets**
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

Use the bucket to keep the report actionable, not just descriptive.

### Step 6: Produce the triage brief
Return a short report with this structure:

```markdown
# Log Triage

## Source
- Type: application | access | proxy | JSON | browser console | network | CI | container/pod | mixed
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
- 1-3 sentence explanation grounded in the log evidence

## Next read-only checks
1. ...
2. ...
3. ...

## Handoff
- Stay in `log-analysis` | route next to `debugging` | route next to `monitoring-observability` | route next to `game-build-log-triage`
```

### Step 7: Escalate carefully when evidence is weak
If the excerpt is too short or starts mid-cascade:
1. Say confidence is low.
2. Ask for the earliest error cluster or 20-80 lines of context around the first failure.
3. Ask for one anchor only if needed: time window, request ID, container/pod name, browser/network trace, or CI stage.
4. Do not pretend certainty from a truncated log.

## Output format
Always produce a concise triage brief, not a stream-of-consciousness analysis.

Required qualities:
- lead with the earliest useful failure, not the loudest line
- separate root cause candidates from repeated fallout
- include the repeated signature or blast radius when visible
- keep all command suggestions read-only
- mask or omit secrets, tokens, session cookies, and personal data
- name the correct handoff skill when the request has moved beyond log triage

## Examples

### Example 1: Kubernetes app failure
**Input**
> `kubectl logs` shows `Error: connect ECONNREFUSED redis:6379` and then dozens of `job retry failed` lines.

**Output sketch**
- Source: container/pod logs in staging
- First actionable failure: `connect ECONNREFUSED redis:6379`
- Pattern / blast radius: repeated worker retries after the initial dependency failure
- Classification: `dependency-or-connection`
- Likely root cause: app cannot reach Redis, so later retry/job failures are fallout
- Next read-only checks:
  1. inspect the first connection failure timestamp and affected pod(s)
  2. compare service/env configuration for Redis host/port
  3. correlate with deploy or Redis restart timing
- Handoff: stay in `log-analysis` until the failure is narrowed, then move to `debugging` or `monitoring-observability` depending on cause

### Example 2: Browser + API mismatch
**Input**
> Browser console shows `Failed to fetch` and the network panel shows `401` on `/api/session`; server logs show `JWT audience invalid`.

**Output sketch**
- Source: mixed browser console + network + server logs
- First actionable failure: server-side JWT audience validation failure
- Pattern / blast radius: all session refresh requests in one environment
- Classification: `browser-network-mismatch` + `auth-or-permission`
- Likely root cause: client symptom is generic, but backend auth validation is the true blocker
- Next read-only checks:
  1. inspect token audience/issuer configuration by environment
  2. compare the failing deploy window to auth config changes
  3. confirm whether only one frontend environment is affected
- Handoff: route next to `debugging` once the config/code suspect is clear

### Example 3: CI transcript with cascade noise
**Input**
> CI ends with `test suite aborted` and hundreds of lines later mentions `ModuleNotFoundError: No module named 'dotenv'`.

**Output sketch**
- Source: CI logs
- First actionable failure: earliest `ModuleNotFoundError` line before the generic abort
- Pattern / blast radius: broad failure for every test process in this job
- Classification: `ci-build-test-failure`
- Likely root cause: missing dependency/import causes the rest of the suite to collapse
- Next read-only checks:
  1. inspect dependency install step and lockfile changes
  2. compare local vs CI environment/package groups
  3. confirm which stage first references `dotenv`
- Handoff: route next to `debugging` after the failing dependency path is identified

## Best practices
1. **Prefer the earliest blocker** — logs often end with generic failure text that hides the real cause above it.
2. **Correlate, don't concatenate** — browser/network/app logs should be linked by time or request ID, not summarized independently.
3. **Group repeated noise** — count or describe the recurring signature instead of repeating identical lines.
4. **Use the smallest slice that answers the question** — narrower evidence produces better triage and safer LLM assistance.
5. **Treat setup work as a separate job** — if the real need is log ingestion, dashboards, or instrumentation, hand off to `monitoring-observability`.
6. **Keep game-engine boundaries clean** — Unity/Unreal build/editor/package logs belong to `game-build-log-triage`, not the general log skill.

## References
- [Docker Docs: Logs and metrics](https://docs.docker.com/config/containers/logging/)
- [Kubernetes: kubectl logs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)
- [Chrome DevTools: Console overview](https://developer.chrome.com/docs/devtools/console/)
- [Chrome DevTools: Inspect network activity](https://developer.chrome.com/docs/devtools/network/)
- [jq manual](https://jqlang.org/manual/)
- [The Logfile Navigator (lnav)](https://lnav.org/)
