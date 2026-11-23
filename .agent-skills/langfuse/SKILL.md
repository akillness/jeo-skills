---
name: langfuse
description: >
  Instrument, self-host, configure, and evaluate LLM applications with observability, tracing, prompt management, and metrics using langfuse/langfuse. Manages OpenTelemetry spans, token cost tracking, Docker Compose deployments, Python/TypeScript SDKs, and evaluation pipelines.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  version: 1.0.0
  source: https://github.com/langfuse/langfuse
---

# langfuse

Langfuse is the leading open-source LLM engineering platform. It provides end-to-end LLM observability, distributed tracing (built on OpenTelemetry), prompt management, automated evaluations, and granular cost/token analytics for compound AI systems and multi-agent workflows.

## Core Capabilities

1. **Observability & Tracing**:
   - Hierarchical traces capturing multi-agent steps, function calls, retrieval contexts, and raw LLM generations.
   - Measures end-to-end latency, Time-to-First-Token (TTFT), token consumption, and cost per call.
2. **Prompt Management**:
   - Decouple prompt engineering from application code. Version, tag (`production`, `staging`), and deploy prompts with fallback mechanisms.
3. **Evals & Scoring**:
   - Collect human feedback (thumbs up/down, numeric scores) and run automated LLM-as-a-judge pipelines.
4. **Native Integrations**:
   - Seamless drop-in wrappers for OpenAI SDK, LangChain, LlamaIndex, LiteLLM, DSPy, and AutoGen.

## Quickstart & Operational Loop

### 1. Preflight Verification
Verify environment variables, server connectivity, and local dependencies:
```bash
python3 scripts/preflight.py
```
Required credentials:
- `LANGFUSE_PUBLIC_KEY`: Public API key (pk-lf-...)
- `LANGFUSE_SECRET_KEY`: Secret API key (sk-lf-...)
- `LANGFUSE_HOST`: API endpoint (defaults to `https://cloud.langfuse.com` or `http://localhost:3000`)

### 2. Local Self-Hosting via Docker Compose
For on-premise or offline development, spin up the complete Langfuse stack:
```bash
docker compose -f docker-compose.yml up -d
# Langfuse UI: http://localhost:3000
```
Stack services:
- `langfuse-web`: Next.js web application and API server.
- `langfuse-worker`: Asynchronous processing engine for batch analytics and evals.
- `postgres`: Relational store for users, projects, and metadata.
- `clickhouse`: High-throughput columnar database for millions of traces and spans.

### 3. Instrumenting Python Code
Use the `@observe` decorator to capture function calls and nested agent execution:
```python
from langfuse.decorators import observe, langfuse_context
from openai import OpenAI

client = OpenAI()

@observe(name="generate-summary")
def summarize_text(text: str):
    # Log custom metadata or tags
    langfuse_context.update_current_observation(tags=["agent-v2", "summarizer"])
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": f"Summarize: {text}"}]
    )
    return response.choices[0].message.content
```

Run test traces and verify output:
```bash
python3 scripts/trace_example.py
```

### 4. Fetching Versioned Prompts
Manage prompt templates centrally without redeploying code:
```bash
python3 scripts/prompt_helper.py --name "customer_support_system" --label "production"
```
```python
from langfuse import Langfuse
langfuse = Langfuse()

# Fetch latest production prompt
prompt = langfuse.get_prompt("customer_support_system", label="production")
compiled = prompt.compile(customer_name="Alice", issue="billing")
```

### 5. Evaluating and Scoring Traces
Record evaluation metrics or user feedback against specific traces:
```python
langfuse.score(
    trace_id="trace_abc123",
    name="hallucination-check",
    value=1.0,  # 1.0 = faithful, 0.0 = hallucination
    comment="Verified against source chunk"
)
```

## Best Practices & Failure Boundaries
- **Async Flush**: In serverless functions (AWS Lambda, Cloudflare Workers), always call `langfuse.flush()` before exiting to prevent unsubmitted telemetry batches from dropping.
- **Masking Sensitive Data**: Use `mask` functions to redact PII (personally identifiable information) or internal credentials before payloads hit the trace ingestion pipeline.
- **ClickHouse Health in Self-Hosting**: If traces lag in the UI, check ClickHouse container memory and verify `langfuse-worker` is processing the ingestion queue without backlog.
