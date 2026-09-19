# LangGraph Advanced State Patterns

## Reducer patterns (list accumulation)

```python
from typing import Annotated
from langgraph.graph.message import add_messages

class State(TypedDict):
    # add_messages reducer: new messages are appended, not replaced
    messages: Annotated[list, add_messages]
    results: list[str]  # replaced on each update
```

## Subgraph composition

```python
# Inner graph
sub_graph = StateGraph(SubState)
# ...build inner graph...
sub_compiled = sub_graph.compile()

# Outer graph calls inner as a node
outer_graph.add_node("inner_workflow", sub_compiled)
```

## Long-running agents with periodic checkpoints

```python
from langgraph.checkpoint.sqlite import SqliteSaver

# Production checkpointer (persists to disk)
with SqliteSaver.from_conn_string("./agent_state.db") as checkpointer:
    compiled = graph.compile(checkpointer=checkpointer)
    result = await compiled.ainvoke(state, config={"configurable": {"thread_id": "job-001"}})
```

## State update with Send (fan-out/fan-in)

```python
from langgraph.types import Send

def fan_out_node(state: State) -> list[Send]:
    """Distribute items to parallel workers."""
    return [Send("worker", {"item": item}) for item in state["items"]]

def fan_in_node(state: State) -> State:
    """Collect results from all workers."""
    return {"summary": aggregate(state["results"])}
```

## Error handling in state

```python
async def safe_node(state: State) -> State:
    try:
        result = await risky_operation()
        return {"result": result, "error": None}
    except SpecificError as e:
        return {"error": str(e), "result": None}

def route_with_error(state: State) -> str:
    if state.get("error"):
        return "error_handler"
    return "next_step"
```
