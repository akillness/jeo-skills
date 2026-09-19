---
name: langgraph-workflow
description: >
  Design and implement stateful multi-agent workflows using LangGraph StateGraph.
  Use when building production AI pipelines that need checkpointing, conditional
  branching, Human-in-the-Loop gates, parallel node execution, or long-running
  agent coordination. Even if the user doesn't explicitly mention "LangGraph" —
  also triggers on: state graph, stateful agent, agent checkpoint, agent loop,
  HITL approval gate, multi-step AI workflow, agent retry logic, langgraph studio,
  conditional edges, persistent agent memory, agentic pipeline, agent branching,
  agent orchestration with state, LangGraph NVIDIA deep agents.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Requires Python >=3.11. Install via `pip install langgraph langchain-core`.
  Works with any LangChain-compatible LLM. Optional: LangGraph Studio, LangSmith tracing.
metadata:
  tags: langgraph, stategraph, multi-agent, checkpointing, hitl, workflow, orchestration, python
  version: "1.0"
  source: akillness/oh-my-gods
---

# langgraph-workflow — Stateful Multi-Agent Graph Design

LangGraph is the industry-standard framework for production multi-agent workflows. Build `StateGraph`-based pipelines with checkpointing, conditional edges, HITL gates, and parallel execution.

## When to use this skill

- Building a multi-step AI pipeline where intermediate state must persist between nodes
- Implementing retry/loop logic (e.g., Editor re-routes to upstream node on low quality)
- Adding Human-in-the-Loop approval gates before destructive operations
- Running nodes in parallel to reduce latency
- Recovering from partial failures via checkpoint resume
- Integrating LangSmith tracing for observability (`@traceable`)

## Core Concepts

### StateGraph and State Schema

```python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    messages: list[dict]
    draft: str
    quality_score: float
    retry_count: int
    error: str | None

graph = StateGraph(AgentState)
```

### Node functions

Each node is an `async` function that receives state and returns a partial update:

```python
async def researcher_node(state: AgentState) -> AgentState:
    result = await llm.ainvoke(state["messages"])
    return {"draft": result.content}

async def editor_node(state: AgentState) -> AgentState:
    score = evaluate_quality(state["draft"])
    return {"quality_score": score}

graph.add_node("researcher", researcher_node)
graph.add_node("editor", editor_node)
```

### Edges and conditional routing

```python
def route_after_editor(state: AgentState) -> str:
    if state["quality_score"] < 0.7 and state["retry_count"] < 3:
        return "retry"
    return "done"

graph.set_entry_point("researcher")
graph.add_edge("researcher", "editor")
graph.add_conditional_edges(
    "editor",
    route_after_editor,
    {"retry": "researcher", "done": END},
)

compiled = graph.compile()
```

### Parallel node execution

```python
# Run two nodes in parallel with Send API
from langgraph.types import Send

def fan_out(state: AgentState) -> list[Send]:
    return [
        Send("analyzer_a", {"input": state["draft"]}),
        Send("analyzer_b", {"input": state["draft"]}),
    ]

graph.add_conditional_edges("splitter", fan_out)
```

## Instructions

### Step 1: Define state schema

Use `TypedDict` for all state fields. Include error handling fields:

```python
class WorkflowState(TypedDict):
    task: str
    results: dict[str, str]    # keyed by node name
    quality: float
    retry_count: int
    metadata: dict             # token usage, timing, etc.
    error: str | None
```

### Step 2: Implement nodes

One node per logical step. Keep nodes pure (no side effects outside state):

```python
async def planning_node(state: WorkflowState) -> WorkflowState:
    plan = await llm.ainvoke(f"Plan this task: {state['task']}")
    return {"results": {**state["results"], "plan": plan.content}}
```

### Step 3: Add checkpointing (for HITL or resumable workflows)

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
compiled = graph.compile(checkpointer=checkpointer)

# Invoke with thread_id for persistence
result = await compiled.ainvoke(
    initial_state,
    config={"configurable": {"thread_id": "session-abc"}},
)
```

### Step 4: Add HITL interrupt gates

```python
# Interrupt BEFORE a node runs
compiled = graph.compile(
    checkpointer=checkpointer,
    interrupt_before=["deploy_node"],  # pause before deploy
)

# Resume after human approval:
result = await compiled.ainvoke(
    None,  # None = resume from checkpoint
    config={"configurable": {"thread_id": "session-abc"}},
)
```

### Step 5: Add LangSmith tracing

```python
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "your-key"

# Nodes auto-traced. Add @traceable for custom spans:
from langsmith import traceable

@traceable(name="custom-eval")
def evaluate_quality(text: str) -> float:
    ...
```

### Step 6: Stream node events

```python
async for event in compiled.astream(initial_state):
    node_name = list(event.keys())[0]
    node_output = event[node_name]
    print(f"[{node_name}] completed")
```

## Examples

### Example 1: Quality-gated writing pipeline

```python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, END

class WriterState(TypedDict):
    topic: str
    draft: str
    quality: float
    retries: int

async def write_node(state: WriterState) -> WriterState:
    draft = await llm.ainvoke(f"Write about: {state['topic']}")
    return {"draft": draft.content}

async def review_node(state: WriterState) -> WriterState:
    score = await score_quality(state["draft"])
    return {"quality": score}

def route(state: WriterState) -> str:
    if state["quality"] < 0.7 and state["retries"] < 3:
        return "rewrite"
    return "done"

graph = StateGraph(WriterState)
graph.add_node("write", write_node)
graph.add_node("review", review_node)
graph.set_entry_point("write")
graph.add_edge("write", "review")
graph.add_conditional_edges("review", route, {"rewrite": "write", "done": END})
app = graph.compile()
```

### Example 2: Multi-agent research with parallel nodes

```python
async def fetch_sources(state):
    return [
        Send("fetch_web", {"query": state["query"]}),
        Send("fetch_docs", {"query": state["query"]}),
    ]

graph.add_conditional_edges("planner", fetch_sources)
graph.add_edge("fetch_web", "synthesizer")
graph.add_edge("fetch_docs", "synthesizer")
```

### Example 3: HITL deployment gate

```python
compiled = graph.compile(
    checkpointer=MemorySaver(),
    interrupt_before=["deploy"],
)
# Agent pauses at "deploy". Human reviews, then:
await compiled.ainvoke(None, config={"configurable": {"thread_id": tid}})
```

## Best practices

1. **Type all state fields** — use `TypedDict`; avoid `dict[str, Any]` at top level
2. **Return partial updates** — nodes return only changed fields, not the full state
3. **Cap retry counts in state** — always include `retry_count: int` and check it in routing
4. **Use checkpointing for any HITL** — `MemorySaver()` for development, `SqliteSaver` for production
5. **Stream in production** — `astream()` prevents timeout on long-running graphs
6. **Trace with LangSmith** — set `LANGCHAIN_TRACING_V2=true` before going to production

## References

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangGraph Studio](https://github.com/langchain-ai/langgraph-studio)
- [NVIDIA × LangGraph Deep Agents](https://github.com/langchain-ai/langgraph)
- [LangSmith Tracing](https://docs.smith.langchain.com/tracing)
- See `references/state-patterns.md` for advanced state management patterns
