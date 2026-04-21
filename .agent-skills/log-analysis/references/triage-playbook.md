# Log Triage Playbook

Use this checklist before writing conclusions:

1. **Name the source first**
   - application/runtime log
   - access/proxy log
   - JSON/structured log
   - browser console
   - browser network
   - CI transcript
   - container/pod output
   - mixed

2. **Find the first actionable failure**
   - fatal line
   - dependency/config/auth blocker
   - request/runtime failure
   - later fallout/noise

3. **Anchor the investigation**
   - timestamp window
   - request/trace/build ID
   - service/container/pod name
   - user/session/tenant identifier (masked)

4. **Describe blast radius**
   - one request
   - repeated requests
   - one worker/job
   - one deploy window
   - one environment
   - broad/systemic

5. **Return a short triage brief**
   - source
   - first actionable failure
   - pattern/blast radius
   - likely root cause
   - next read-only checks
   - handoff target

## Red flags
- The excerpt starts after the true cause.
- The only visible evidence is a generic abort or timeout.
- Secrets or user data appear in the pasted logs.
- The request is actually asking for observability pipeline setup rather than log triage.
- The logs are Unity/Unreal engine-specific and should route to `game-build-log-triage`.
