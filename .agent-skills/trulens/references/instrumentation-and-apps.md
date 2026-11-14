# TruLens Instrumentation and Application Wrappers Reference

## 1. TruSession Configuration

The `TruSession` manages the evaluation persistence lifecycle, database connections, and run metadata.

```python
from trulens.core import TruSession

# 1. Default local SQLite database in current working directory
session = TruSession()

# 2. Explicit custom database URL (PostgreSQL or SQLite)
session = TruSession(database_url="sqlite:///evaluations.sqlite")

# 3. Reset database records for a fresh benchmarking run (use with care)
# session.reset_database()
```

---

## 2. Instrumenting LangChain Applications (`TruChain`)

Package: `trulens-apps-langchain`

```python
from langchain_core.runnables import RunnablePassthrough
from trulens.apps.langchain import TruChain
from trulens.core import TruSession

session = TruSession()

# Create your existing LangChain RAG chain:
# rag_chain = (
#     {"context": retriever, "question": RunnablePassthrough()}
#     | prompt
#     | llm
#     | StrOutputParser()
# )

tru_recorder = TruChain(
    rag_chain,
    app_name="CustomerSupportRAG",
    app_version="v1.0",
    feedbacks=[f_groundedness, f_context_relevance, f_answer_relevance]
)

# Run with recording context
with tru_recorder as recording:
    result = rag_chain.invoke("How do I reset my password?")

# Inspect record details
record = recording.get()
print("Record ID:", record.record_id)
print("Cost:", record.cost)
print("Latency:", record.perf.latency)
```

---

## 3. Instrumenting LlamaIndex Applications (`TruLlama`)

Package: `trulens-apps-llamaindex`

```python
from trulens.apps.llamaindex import TruLlama
from trulens.core import TruSession

session = TruSession()

# Existing query engine:
# query_engine = index.as_query_engine()

tru_query_engine = TruLlama(
    query_engine,
    app_name="DocSearchQueryEngine",
    app_version="v2.1",
    feedbacks=[f_groundedness, f_context_relevance, f_answer_relevance]
)

with tru_query_engine as recording:
    response = query_engine.query("What is the refund policy?")
```

---

## 4. Instrumenting Custom Python Applications (`TruCustomApp`)

Package: `trulens-core`

Decorate custom methods with `@instrument` so TruLens captures intermediate execution steps:

```python
from trulens.core import TruCustomApp, TruSession
from trulens.core.instruments import instrument

session = TruSession()

class SimpleCustomRAG:
    @instrument
    def retrieve_context(self, query: str) -> list[str]:
        # Vector search or keyword retrieval
        return ["Refunds must be requested within 30 days of purchase."]

    @instrument
    def generate_answer(self, query: str, context: list[str]) -> str:
        # LLM completion call
        return f"Based on: {context[0]}, you can request a refund within 30 days."

    @instrument
    def query(self, user_input: str) -> str:
        ctx = self.retrieve_context(user_input)
        return self.generate_answer(user_input, ctx)

rag_app = SimpleCustomRAG()

tru_app = TruCustomApp(
    rag_app,
    app_name="CustomInHouseRAG",
    app_version="v1.0",
    feedbacks=[f_groundedness, f_answer_relevance]
)

with tru_app as recording:
    res = rag_app.query("Can I get a refund after 2 weeks?")
```

---

## 5. TruLens Guardrails (`with_feedback_filter`)

Guardrails block, replace, or flag responses failing a feedback threshold:

```python
from trulens.core.guardrails.base import with_feedback_filter

# Define a guarded method:
class SafeRagAgent:
    @with_feedback_filter(
        feedback_function=f_groundedness,
        threshold=0.8,
        action="raise_exception"  # Or "fallback_response"
    )
    def answer_safely(self, question: str) -> str:
        return rag_chain.invoke(question)
```

---

## 6. Dashboard Launch and Exploration

Launch the dashboard via CLI:
```bash
# Default dashboard on port 8501
trulens dashboard

# Custom port or database file
trulens dashboard --port 8502 --database-url sqlite:///evaluations.sqlite
```

Or from Python:
```python
from trulens.dashboard import run_dashboard

run_dashboard(port=8501, force=True)
```
