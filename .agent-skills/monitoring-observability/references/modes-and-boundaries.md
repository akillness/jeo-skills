# Monitoring-Observability Modes and Boundaries

## Primary modes

| Mode | Core question | Best outputs |
|------|---------------|--------------|
| Service reliability | Is the user-visible service healthy and alertable? | SLO/SLI map, dashboard questions, alert policy |
| Telemetry foundation | What should we instrument and correlate? | telemetry rollout plan, field naming, retention/sampling guidance |
| Data / pipeline observability | Can we trust the pipeline and downstream dashboards? | freshness/schema/volume/lineage checks and ownership |
| Game / live-ops visibility | Can we see launch stability, crashes, and session health? | launch-event observability brief, crash context checklist |
| Review / gap audit | What is weak, noisy, or missing in the current stack? | keep/fix/delete/add remediation list |

## Neighboring skill boundaries

- `log-analysis`
  - Use when logs already exist and the main task is finding the first actionable failure.
  - Not for choosing instrumentation, retention, alert routing, or dashboard ownership.

- `debugging`
  - Use when the likely bug is in code behavior and you need reproduce → isolate → verify.
  - Not for deciding what telemetry should exist before the next incident.

- `performance-optimization`
  - Use when measurements already show latency/throughput/resource bottlenecks and you need tuning.
  - Not for building the telemetry foundation itself.

- `deployment-automation`
  - Use when shipping a release safely through preview/staging/prod promotion and rollback planning.
  - Monitoring-observability may define post-deploy telemetry questions, but not the release workflow.

- `langsmith`
  - Use for LLM traces, evals, prompt versioning, and AI-specific production monitoring.
  - Monitoring-observability covers general service / system / pipeline observability.

- `game-performance-profiler`
  - Use when the real job is CPU/GPU/memory/frame-time bottleneck interpretation in Unity or Unreal.
  - Monitoring-observability covers crash/session/backend/live-ops visibility around the game.

## Anti-patterns

- One skill tries to do instrumentation setup, incident root-cause analysis, and code fixes.
- Dashboards are treated as the whole observability strategy.
- Alert volume grows because teams page on internal causes instead of end-user symptoms.
- Data pipeline reliability is ignored because the team only thinks in app/server terms.
- Game workflows are collapsed into generic backend examples with no build/platform/session context.
