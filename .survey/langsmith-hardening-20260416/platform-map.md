# Platform Map: langsmith hardening

## Settings
| Concern | LangSmith | Adjacent platforms | Common Layer |
|---------|-----------|--------------------|--------------|
| Tracing enablement | `LANGSMITH_TRACING`, API key, project/env vars, SDK wrappers | Similar env/config plus SDK hooks, proxies, or OTel setup | `settings.tracing`, `settings.project`, `settings.env` |
| Workspace/project selection | project/workspace metadata, project env vars | project/app/workspace selection everywhere | `settings.workspace`, `settings.project` |
| Eval configuration | dataset name/ID, evaluators, experiment prefix, concurrency | dataset/run selection varies but same concept exists | `settings.eval_dataset`, `settings.eval_judges`, `settings.eval_concurrency` |
| Prompt registry | Prompt Hub push/pull/version refs | prompt registries or Git/config alternatives | `settings.prompt_registry` |
| Provider capture mode | wrappers like `wrap_openai`, decorators, tracing contexts | wrappers, middleware, proxies, or OTel exporters | `settings.capture_mode` |

## Rules
| Concern | LangSmith | Adjacent platforms | Common Layer |
|---------|-----------|--------------------|--------------|
| Data hygiene | serializers / metadata discipline are app-owned | same across observability stacks | `rules.redaction`, `rules.metadata_schema` |
| Evaluation truth | custom evaluators and feedback configs define pass/fail | same in Braintrust / Langfuse / Phoenix style stacks | `rules.eval_rubric`, `rules.feedback_schema` |
| Runtime guardrails | not the main product surface | usually external app logic or separate guardrail tools | `rules.runtime_policy` usually outside this layer |
| Review requirements | annotation queues and feedback labels need explicit design | same for human review systems | `rules.review_required_labels`, `rules.review_queue_policy` |

## Hooks
| Lifecycle | LangSmith | Adjacent platforms | Common Layer |
|-----------|-----------|--------------------|--------------|
| Pre-model / pre-tool call | decorators, wrappers, callbacks | middleware, hooks, or proxy capture | `hooks.pre_model_call`, `hooks.pre_tool_call` |
| Post-run feedback | `create_feedback` after a run | similar review/eval callbacks elsewhere | `hooks.post_run_feedback` |
| Human review enqueue | annotation queues | review queues / label UIs | `hooks.human_review_enqueue` |
| Cross-service propagation | export/import trace headers manually | OTel propagation or vendor-specific headers | `hooks.trace_propagation` |
| Shutdown handling | explicit tracer flush helpers | similar async telemetry flush flows | `hooks.on_shutdown_flush` |

## Platform Gaps
- LangSmith maps strongly to tracing/evals/feedback hooks, but only partially to runtime rules.
- Generic observability, deployment orchestration, and incident policy remain outside the core LangSmith abstraction.
- Cross-service / multi-agent propagation exists, but it is still explicit glue rather than a no-thought default.
- Prompt Hub is useful but should be framed as one registry option, not the mandatory home for every prompt lifecycle.
- The `langsmith` skill should describe LangSmith as a trace/eval substrate with operator packets, not as a total replacement for monitoring-observability, deployment automation, or runtime guardrail systems.
