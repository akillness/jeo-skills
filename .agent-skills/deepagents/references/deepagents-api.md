# Deep Agents Notes

## What the harness gives you

Deep Agents is a LangGraph-backed harness for:

- planning and task decomposition
- file tools such as `ls`, `read_file`, `write_file`, `edit_file`, `glob`, and `grep`
- subagent delegation through a built-in `task` capability
- persistence and HITL when compiled with a checkpointer

The harness is best used when you want a capable tool-using agent quickly. Use raw LangGraph when the workflow itself is the product.

## Core entry point

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="openai:gpt-5.4",
    tools=[],
    middleware=[],
    subagents=[],
    skills=[],
    memory=[],
    response_format=None,
    checkpointer=None,
    backend=None,
    interrupt_on=None,
    debug=False,
    name="deep-agent",
)
```

## Backend selection

### StateBackend

- Default backend when you call `create_deep_agent()` with no override
- Ephemeral scratch filesystem stored in LangGraph state
- Persists within a thread when checkpoints are enabled
- Shared between supervisor and subagents

### StoreBackend

- Durable storage backed by LangGraph store infrastructure
- Good for cross-thread memory or reusable instructions
- Often paired with `CompositeBackend`

### FilesystemBackend

- Real filesystem access under a configured root
- Prefer `virtual_mode=True`
- Keep secrets outside the allowed root

### LocalShellBackend

- Real filesystem plus host shell execution
- High risk and development-only
- Pair with `interrupt_on` approval for any serious usage

### CompositeBackend

Use when you want both scratch space and durable memory:

```python
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore

agent = create_deep_agent(
    backend=lambda rt: CompositeBackend(
        default=StateBackend(rt),
        routes={"/memories/": StoreBackend(rt)},
    ),
    store=InMemoryStore(),
)
```

## HITL pattern

```python
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

agent = create_deep_agent(
    checkpointer=MemorySaver(),
    interrupt_on={
        "write_file": {"allowed_decisions": ["approve", "reject"]},
        "execute": {"allowed_decisions": ["approve", "edit", "reject"]},
    },
)
```

Important points:

- HITL needs a checkpointer
- resume on the same `thread_id`
- use narrower `allowed_decisions` for lower-risk tools if editing should not be allowed

## Skills vs memory

Use `skills=` when you want progressive-disclosure capabilities that activate on matching user intent.

Use `memory=` when you want always-available project knowledge, norms, or instructions.

They solve different problems and should not be collapsed into one monolithic prompt.

## Hybrid architecture

Use raw LangGraph to own:

- workflow state
- retry loops
- branching and approval routing
- checkpoint lifecycle

Use Deep Agents to own:

- tool-heavy specialist execution
- file-aware research or coding subtasks
- narrowly scoped delegated work

## Links

- https://docs.langchain.com/oss/python/deepagents/overview
- https://docs.langchain.com/oss/python/deepagents/backends
- https://docs.langchain.com/oss/python/deepagents/human-in-the-loop
- https://docs.langchain.com/oss/python/deepagents/skills
