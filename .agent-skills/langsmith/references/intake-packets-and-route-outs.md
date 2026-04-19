# Intake packets and route-outs

## Packet chooser
Use one primary packet per run.

| Packet | Use when | Typical request shape | Route-out signal |
|---|---|---|---|
| `trace-debug` | The team cannot explain what happened in the run tree | add tracing, missing spans, trace coverage, wrapper vs decorator choice | Once the likely failure path is visible and debugging or infra ownership becomes the bottleneck |
| `eval` | A change needs pre-ship or regression confidence | dataset, evaluator, experiment, baseline vs candidate | Once the question becomes rollout policy or generic KPI interpretation |
| `review` | Production traces need structured human or automated scoring | annotation queue, rubric, inline feedback, review cadence | Once the issue becomes support ops, moderation, or broader analytics workflow |
| `prompt-registry` | Prompt/version ownership is unclear | Prompt Hub, Git sync, prompt versions, release confidence | Once prompt source-of-truth is decided and implementation belongs elsewhere |
| `propagation` | One request spans services, workers, or agent hops | cross-service traces, parent/child lineage, headers, metadata handoffs | Once the job becomes generic distributed observability or rollout coordination |
| `audit` | LangSmith exists already but still does not inspire trust | noisy metadata, missing evals, broken lineage, absent review flow | Once the first ratchet is chosen and a neighboring skill owns the next implementation step |

## Surface ladder
- **Quick trace coverage** → provider wrappers + a few high-value decorators
- **Named workflow spans** → `traceable()` / decorators around application functions
- **Scoped audit visibility** → manual tracing context or targeted trace blocks
- **Pre-ship confidence** → dataset + evaluator + experiment packet
- **Human-review flow** → annotation queue + feedback criteria + reviewer ownership
- **Cross-service lineage** → explicit header / metadata propagation
- **Audit/export workflow** → CLI list/get/export flows

## Required fields to preserve
- project/workspace/environment
- `run_id`
- `trace_id`
- tags and metadata fields that support later filtering
- user/session/request identifiers when review or analytics need them

## Quick route-outs
- Generic telemetry, dashboards, alerts, or SLOs → `monitoring-observability`
- Existing-log root-cause work → `log-analysis`
- Reproduction and code-path diagnosis → `debugging`
- Deployment or rollout choreography → `deployment-automation`
- Exported experiment/KPI interpretation → `data-analysis`
- Runtime policy, approvals, or guardrails → relevant security/policy skill

## Smell test
If your next paragraph is mostly about service-health dashboards, incident response, deployment steps, or generic product metrics instead of LangSmith packets, this skill has already done its job.
