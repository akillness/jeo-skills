# Platform Map: langsmith structural hardening

## Settings
| Concern | LangSmith | Langfuse | Helicone | Common Layer |
|---------|-----------|----------|----------|--------------|
| Tracing setup | SDK wrappers, decorators, tracing context, project/workspace/env grouping | Native SDKs + OpenTelemetry framing | Gateway/proxy headers plus observability features | Choose instrumentation surface and grouping metadata first |
| Evaluation setup | Datasets, offline/online eval flows, evaluators, experiments | Evals plus prompt experiments and metrics | Eval scores, datasets, reports | Decide dataset/evaluator packet before rollout |
| Prompt management | Prompt engineering, Prompt Hub, model/provider settings | Prompt management with versioning/playground | Prompt management inside gateway/platform | Decide whether platform or Git/app config is canonical |
| Deployment / environment | Dedicated deployment + platform-setup sections | Cloud/self-hosted/platform sections | Gateway/runtime configuration | Keep platform setup separate from first diagnosis packet |

## Rules
| Concern | LangSmith | Langfuse | Helicone | Common Layer |
|---------|-----------|----------|----------|--------------|
| What belongs in the platform | Traces, evals, prompt engineering, deployment | Traces, prompts, evals, metrics | Gateway routing, analytics, feedback, alerts | Do not let the front door absorb every adjacent ops task |
| Human review boundary | Annotation queues + feedback criteria | Eval/feedback layers plus metrics | User feedback + reports | Human-review rubric and ownership are separate from tracing alone |
| Generic observability boundary | Partial fit, but not a full SLO/alerting owner | Stronger telemetry posture, still not universal | Broader analytics/alerts, still not all observability | Route generic telemetry / outage / infra ownership elsewhere when needed |
| Prompt-source-of-truth | Prompt Hub optional | Platform prompt management optional | Platform prompt layer optional | Explicitly decide platform-vs-Git ownership |

## Hooks
| Lifecycle | LangSmith | Langfuse | Helicone | Common Layer |
|-----------|-----------|----------|----------|--------------|
| Pre-request | Choose mode, project, metadata, instrumentation surface | Choose trace schema / OTel path / prompt source | Choose gateway headers, session, prompt/routing config | Label workflow before implementation |
| During run | Capture traces, run experiments, attach feedback | Capture traces/sessions, evals, prompt linkage | Proxy traffic, collect metrics/feedback, score requests | Preserve IDs/metadata needed for later review |
| Post-run | Compare experiments, review queues, analyze traces | Review metrics/evals, compare prompts | Reports, alerts, feedback analysis | End with one verification step and one next artifact |
| Cross-service | Propagate trace IDs and metadata | OTel-native propagation and sessions | Gateway/session/user metadata | Keep lineage explicit across boundaries |

## Platform Gaps
- LangSmith is the strongest fit when the request is explicitly LangSmith-oriented, but its product breadth still creates the same front-door ambiguity the repo is trying to avoid.
- Langfuse and Helicone confirm that the market keeps bundling tracing, prompts, evals, analytics, and platform controls together, which means the repo skill should stay narrower than the tools themselves.
- The repo's abstraction does not need to mirror every vendor category; it only needs a stable operator packet: selected mode, chosen surface, required config/IDs, verification step, and route-outs.
