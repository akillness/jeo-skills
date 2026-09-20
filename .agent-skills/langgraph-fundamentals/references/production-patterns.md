# LangGraph production patterns (jeo catalog addition)

This note is **not** part of upstream `langchain-ai/langchain-skills`. It was merged into
`langgraph-fundamentals` on 2026-09-19 from the former `langgraph-workflow` wrapper skill
(akillness/oh-my-gods), which is now recorded in `skills.json` `retired_skills`. Upstream
stays canonical for state, nodes, edges, `Command`, `Send`, invoke/stream, and error
handling; `langgraph-persistence` owns checkpointers and time travel;
`langgraph-human-in-the-loop` owns `interrupt()` / `Command(resume=...)`. This note keeps
the few production details the wrapper added on top.

## Disk-backed checkpointer for long-running jobs

```python
from langgraph.checkpoint.sqlite import SqliteSaver

with SqliteSaver.from_conn_string("./agent_state.db") as checkpointer:
    compiled = graph.compile(checkpointer=checkpointer)
    result = await compiled.ainvoke(state, config={"configurable": {"thread_id": "job-001"}})
```

Use `MemorySaver` only for tests and notebooks; a thread that must survive a process
restart needs SQLite/Postgres.

## Coarse approval gate with `interrupt_before`

```python
compiled = graph.compile(checkpointer=checkpointer, interrupt_before=["deploy_node"])
# ... run until it pauses before deploy_node, review, then resume on the same thread:
result = await compiled.ainvoke(None, config={"configurable": {"thread_id": "session-abc"}})
```

`interrupt_before` pauses the whole node; prefer `interrupt()` inside the node
(`langgraph-human-in-the-loop`) when the human must edit a value rather than approve/skip.

## Subgraph composition

```python
sub_compiled = StateGraph(SubState).compile()
outer_graph.add_node("inner_workflow", sub_compiled)   # a compiled graph is a node
```

Keep the subgraph's state keys a subset of the parent's or add an adapter node; see
`langgraph-persistence` for subgraph checkpointer scoping.

## Error fields in state, not exceptions across nodes

```python
async def safe_node(state: State) -> State:
    try:
        return {"result": await risky_operation(), "error": None}
    except SpecificError as e:
        return {"error": str(e), "result": None}

def route_with_error(state: State) -> str:
    return "error_handler" if state.get("error") else "next_step"
```

## Tracing and streaming

```python
import os
os.environ["LANGSMITH_TRACING"] = "true"          # nodes are auto-traced
from langsmith import traceable

@traceable(name="custom-eval")
def score(output): ...

async for event in compiled.astream(initial_state):   # one dict per node update
    ...
```

Operating LangSmith itself (projects, datasets, evals, annotation queues) is the
`langsmith` skill; provider-neutral instrumentation choices are `agent-observability`.
