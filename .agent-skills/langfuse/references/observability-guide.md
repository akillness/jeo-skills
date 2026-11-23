# Langfuse Observability & Tracing Architecture

Langfuse models AI executions using a hierarchical trace tree built on OpenTelemetry standards:

```
Trace (Single interaction or user session)
 ├── Span (Parent workflow: e.g. RAG Pipeline)
 │    ├── Span (Retrieval step: Vector query)
 │    ├── Generation (LLM Call: Prompt, Completion, Token Counts)
 │    └── Event (Cache hit, guardrail trigger)
 └── Score (Evaluation metric, user feedback)
```

## Core Entities
- **Trace**: The top-level container representing an end-to-end user request.
- **Span**: Represents any non-LLM operation (retrieval, database query, data transformation, API call).
- **Generation**: A specific LLM inference invocation with input prompts, completions, token usage breakdown, and latency timings.
- **Event**: An instantaneous checkpoint (e.g. guardrail flagged, cache hit, retry attempt).
- **Score**: A numeric or categorical assessment associated with a trace, span, or generation.
