---
name: deepagents
description: >
  Build file-aware, tool-calling agents with LangChain Deep Agents. Use when
  you need `create_deep_agent()`, subagent delegation, pluggable backends,
  skills, long-term memory, or human approval with `interrupt_on`. Triggers on:
  deepagents, deep agent harness, create_deep_agent, subagent middleware,
  StateBackend, StoreBackend, CompositeBackend, LocalShellBackend, interrupt_on,
  long-term memory, agent skills, file-aware agent, durable coding agent.
license: MIT
compatibility: >
  Requires Python >=3.11. Install with `pip install -qU deepagents` or use
  `uv add deepagents` inside an existing Python project. Works with any
  LangChain chat model that supports tool calling.
metadata:
  version: "1.1"
  source: langchain-ai/deepagents
  tags: langchain, langgraph, deep-agents, ai-agent, middleware, subagents, backends, python
allowed-tools: Bash Read Write Edit Glob Grep
---

# deepagents

Deep Agents is a batteries-included agent harness built on top of LangGraph. Use it when the problem is "give me a capable agent with planning, files, subagents, and memory" rather than "let me hand-author every graph edge myself."

## When to use this skill

- Building a tool-calling agent that needs file access and planning quickly
- Delegating bounded work to specialized subagents with context isolation
- Choosing between `StateBackend`, `FilesystemBackend`, `StoreBackend`, `CompositeBackend`, or `LocalShellBackend`
- Adding skills and long-term memory without bloating the core prompt
- Requiring human approval before sensitive tool calls with `interrupt_on`
- Using deepagents as a specialist inside a larger LangGraph supervisor

## Installation

```bash
pip install -qU deepagents
```

Inside an existing `uv`-managed project:

```bash
uv add deepagents
```

Optional provider and MCP packages:

```bash
pip install -qU langchain-anthropic langchain-openai langchain-google-genai
pip install -qU langchain-mcp-adapters
```

## Core API

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="openai:gpt-5.4",
    tools=[],
    system_prompt="You are a careful engineering agent.",
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

Deep Agents work with LangChain chat models that support tool calling. The simplest selector is `provider:model`.

## Instructions

### Step 1: Start with the default harness

For many workflows, the zero-config harness is enough:

```python
from deepagents import create_deep_agent

agent = create_deep_agent()
result = agent.invoke(
    {"messages": [{"role": "user", "content": "List the Python files in this repo"}]}
)
```

This gives you:
- planning via the built-in todo capability
- file tools such as `ls`, `read_file`, `write_file`, `edit_file`, `glob`, and `grep`
- LangGraph runtime features such as streaming and resumability when a checkpointer is attached

### Step 2: Pick the right backend

Match the backend to the trust boundary:

```python
from deepagents.backends import CompositeBackend, FilesystemBackend, LocalShellBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore

agent = create_deep_agent(
    backend=lambda rt: CompositeBackend(
        default=StateBackend(rt),
        routes={"/memories/": StoreBackend(rt)},
    ),
    store=InMemoryStore(),
)
```

Guidance:
- `StateBackend`: default ephemeral workspace in LangGraph state, scoped to a thread
- `StoreBackend`: durable cross-thread memory and instructions
- `FilesystemBackend`: real files under a root directory; prefer `virtual_mode=True`
- `LocalShellBackend`: host shell access, development-only, high risk
- `CompositeBackend`: mix scratch space and durable memory under different path prefixes

### Step 3: Add subagents only for real context isolation

```python
from deepagents import MemoryMiddleware, SubAgent, SubAgentMiddleware, create_deep_agent

researcher = SubAgent(
    name="researcher",
    description="Finds documentation and summarizes it",
    system_prompt="Search broadly, return concise evidence.",
    tools=[web_search_tool],
)

agent = create_deep_agent(
    middleware=[
        MemoryMiddleware(memory_files=["AGENTS.md"]),
        SubAgentMiddleware(subagents=[researcher]),
    ]
)
```

Use subagents when:
- the specialist needs a narrower tool set
- you want the supervisor context to stay clean
- a subtask can be delegated without the main agent rereading all prior context

### Step 4: Add HITL for risky tools

Human approval requires both `interrupt_on` and a checkpointer:

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

Resume on the same thread:

```python
from langgraph.types import Command

config = {"configurable": {"thread_id": "job-7"}}
first = agent.invoke({"messages": [...]}, config=config, version="v2")
second = agent.invoke(Command(resume=[{"decision": "approve"}]), config=config, version="v2")
```

### Step 5: Use skills and memory for different jobs

```python
agent = create_deep_agent(
    skills=["./skills/langgraph-workflow"],
    memory=["AGENTS.md", "TEAM_GUIDELINES.md"],
)
```

Use:
- `skills` for reusable workflows and domain-specific procedures
- `memory` for stable project knowledge, preferences, and house rules

Do not collapse both into a giant system prompt. Let the harness load them progressively.

### Step 6: Use Deep Agents inside LangGraph when orchestration gets custom

If you need explicit retries, branching, or supervisor-owned state, use LangGraph outside and deepagents inside specialist nodes.

## Examples

### Example 1: Minimal file-aware agent

```python
from deepagents import create_deep_agent

agent = create_deep_agent(model="openai:gpt-5.4")
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Summarize the README and note any missing setup steps"}]}
)
```

### Example 2: Composite backend with durable memory route

```python
from deepagents import create_deep_agent
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

### Example 3: Research specialist subagent

```python
from deepagents import SubAgent, SubAgentMiddleware, create_deep_agent

researcher = SubAgent(
    name="researcher",
    description="Searches docs and summarizes findings",
    system_prompt="Return concise, source-backed notes.",
    tools=[search_docs],
)

agent = create_deep_agent(
    middleware=[SubAgentMiddleware(subagents=[researcher])]
)
```

### Example 4: HITL for shell execution

```python
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

agent = create_deep_agent(
    checkpointer=MemorySaver(),
    interrupt_on={"execute": True},
)
```

## Best practices

1. Start with the default harness before customizing middleware.
2. Use `StateBackend` for scratch space and `CompositeBackend` when long-term memory is needed.
3. Treat `LocalShellBackend` as development-only and pair it with human approval.
4. Prefer `FilesystemBackend(root_dir=..., virtual_mode=True)` over unconstrained local file access.
5. Use `skills` for reusable capabilities and `memory` for persistent project context.
6. Add subagents for context isolation, not because multi-agent sounds impressive.
7. If routing becomes graph-shaped, move orchestration to LangGraph and keep deepagents as a specialist.

## Framework selection guide

| Need | Recommendation |
| --- | --- |
| Fast path to a capable coding or ops agent | Deep Agents |
| Custom retry loops, branching, supervisor-owned state | LangGraph |
| Simple single-agent tool use | LangChain `create_agent` |
| Durable workflow plus specialist harness | LangGraph + Deep Agents hybrid |

## References

- [Deep Agents Overview](https://docs.langchain.com/oss/python/deepagents/overview)
- [Deep Agents Backends](https://docs.langchain.com/oss/python/deepagents/backends)
- [Deep Agents Human-in-the-loop](https://docs.langchain.com/oss/python/deepagents/human-in-the-loop)
- [Deep Agents Skills](https://docs.langchain.com/oss/python/deepagents/skills)
- See `references/deepagents-api.md` for backend, memory, and HITL notes
