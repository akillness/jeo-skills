---
name: trulens
description: >
  Use when instrumenting, evaluating, tracing, or benchmarking LLM applications and AI agents with TruLens. Covers RAG Triad evaluations (Context Relevance, Groundedness, Answer Relevance), feedback function definition with Snowflake Cortex, OpenAI, Bedrock, LiteLLM or HuggingFace providers, instrumenting LangChain (TruChain), LlamaIndex (TruLlama), LiteLLM, or custom apps (TruCustomApp), setting up guardrail filters, and launching the TruLens dashboard. Route format-only skill linting to skill-standardization, standalone Kubernetes agent infrastructure to kagent, and raw telemetry export to agent-observability.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 2.16.0
  source: https://github.com/truera/trulens
  upstream_commit: 32f57106c7f897a05806107737c413e65665fe46
---

# TruLens

## When to use this skill

Use when designing, configuring, executing, or troubleshooting evaluations for LLM applications and AI agents with TruLens. TruLens provides objective evaluation metrics (including the RAG Triad), feedback functions, tracing, guardrails, and an interactive exploration dashboard.

### Route-outs
- For validating Agent Skills specification format, frontmatter, or directory structure, use `skill-standardization`.
- For Kubernetes-native agent deployment, CRDs, and Substrate sandboxes, use `kagent`.
- For raw OpenTelemetry export or streaming telemetry pipelines without LLM evaluation logic, use `agent-observability`.
- For benchmarking across broad foundation models or agent benchmarks without TruLens wrappers, use `agent-benchmarking` or `nvidia-skill-evaluator`.

## Instructions

### 1. Offline environment preflight

Before initiating model calls or database migrations, run the offline environment preflight helper:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
```

This verifies the local presence of `trulens` CLI and Python packages (`trulens-core`, `trulens-apps-langchain`, `trulens-apps-llamaindex`, providers) without making network calls or running external binaries.

### 2. Initialize TruSession

Create and configure a `TruSession` to manage evaluation persistence:

```python
from trulens.core import TruSession

# Local development SQLite
session = TruSession()

# Or managed database for production tracking:
# session = TruSession(database_url="postgresql+psycopg2://user:pass@host/db")
```

### 3. Construct the RAG Triad feedback functions

Define the three core RAG Triad feedback functions using an authorized provider:

```python
import numpy as np
from trulens.core import Feedback
from trulens.feedback import Groundedness
from trulens.providers.openai import OpenAI

provider = OpenAI(model_engine="gpt-4o")

# 1. Answer Relevance: query -> response
f_answer_relevance = (
    Feedback(provider.relevance, name="Answer Relevance")
    .on_input_output()
)

# 2. Context Relevance: query -> context chunk
f_context_relevance = (
    Feedback(provider.context_relevance_with_cot_reasons, name="Context Relevance")
    .on_input()
    .on(TruChain.select_context(rag_chain))
    .aggregate(np.mean)
)

# 3. Groundedness: context chunk -> response
groundedness = Groundedness(groundedness_provider=provider)
f_groundedness = (
    Feedback(groundedness.groundedness_measure_with_cot_reasons, name="Groundedness")
    .on(TruChain.select_context(rag_chain))
    .on_output()
    .aggregate(groundedness.grounded_statements_aggregator)
)

feedbacks = [f_answer_relevance, f_context_relevance, f_groundedness]
```

### 4. Instrument application pipelines

Wrap your application in the appropriate TruLens recorder:

- **LangChain:** `TruChain(chain, app_name="RAGApp", feedbacks=feedbacks)`
- **LlamaIndex:** `TruLlama(query_engine, app_name="LlamaRAG", feedbacks=feedbacks)`
- **Custom Apps:** `TruCustomApp(app, app_name="CustomRAG", feedbacks=feedbacks)` with methods decorated with `@instrument`.

Record queries using the context manager:

```python
with tru_recorder as recording:
    response = rag_chain.invoke("What are the system requirements?")

record = recording.get()
print(f"Record ID: {record.record_id}, Latency: {record.perf.latency}s")
```

### 5. Attach Guardrails

Use feedback filters to prevent ungrounded or low-quality generations from escaping to users:

```python
from trulens.core.guardrails.base import with_feedback_filter

class GuardedAssistant:
    @with_feedback_filter(
        feedback_function=f_groundedness,
        threshold=0.75,
        action="raise_exception"
    )
    def answer(self, prompt: str) -> str:
        return rag_chain.invoke(prompt)
```

### 6. Inspect evaluations via the dashboard

Start the web dashboard to compare experiments, inspect traces, and audit failure reasons:

```bash
# Launch via CLI
trulens dashboard --port 8501
```

```python
# Launch programmatically
from trulens.dashboard import run_dashboard
run_dashboard(port=8501)
```

## Examples

### Complete LangChain RAG Triad workflow

```python
from langchain_community.vectorstores import FAISS
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from trulens.apps.langchain import TruChain
from trulens.core import Feedback, TruSession
from trulens.feedback import Groundedness
from trulens.providers.openai import OpenAI as TruOpenAI

# 1. Setup session and feedback provider
session = TruSession()
tru_provider = TruOpenAI(model_engine="gpt-4o-mini")
groundedness = Groundedness(groundedness_provider=tru_provider)

# 2. Define feedbacks
f_groundedness = (
    Feedback(groundedness.groundedness_measure_with_cot_reasons, name="Groundedness")
    .on(TruChain.select_context(rag_chain))
    .on_output()
)
f_relevance = Feedback(tru_provider.relevance, name="Relevance").on_input_output()

# 3. Instrument and execute
tru_recorder = TruChain(rag_chain, app_name="SupportBot", feedbacks=[f_groundedness, f_relevance])
with tru_recorder as recording:
    output = rag_chain.invoke("How do I update my billing email?")
```

## Best practices

1. **Run offline preflight first:** Check dependencies and local databases via `scripts/preflight.py` before live execution.
2. **Decouple evaluation latency:** In high-throughput systems, execute feedback functions asynchronously (`run_deferred=True`) so user response latency is unaffected.
3. **Never commit raw credentials:** Load provider API keys from environment variables (`OPENAI_API_KEY`, `SNOWFLAKE_ACCOUNT`, `AWS_ACCESS_KEY_ID`); never hardcode them in session files.
4. **Isolate evaluation databases:** Use separate SQLite files or distinct PostgreSQL schemas per environment (`dev`, `staging`, `prod`) to avoid cross-polluting experiment metrics.

## References

- [RAG Triad and Feedback Functions](references/rag-triad-and-feedback.md): Detailed provider matrix, selector mechanics, and custom feedback functions.
- [Instrumentation and Applications](references/instrumentation-and-apps.md): TruChain, TruLlama, TruCustomApp, and Guardrail filters.
- [Sources and Provenance](references/sources.md): TruLens upstream repository, versioning, and architectural boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral evaluation prompts for TruLens operations.
