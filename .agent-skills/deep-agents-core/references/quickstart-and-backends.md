# Deep Agents quickstart, backends, and HITL resume (jeo catalog addition)

This note is **not** part of upstream `langchain-ai/langchain-skills`. It was merged into
`deep-agents-core` on 2026-09-19 from the former `deepagents` wrapper skill
(akillness/oh-my-gods), which is now recorded in `skills.json` `retired_skills`. The
upstream trio stays canonical: `deep-agents-core` (harness, `create_deep_agent()`,
SKILL.md format), `deep-agents-memory` (backends), `deep-agents-orchestration`
(subagents, TodoList, HITL). Read those first; this note only keeps the operator details
they do not spell out.

## Install

```bash
pip install -qU deepagents                      # Python >= 3.11
uv add deepagents                               # inside a uv-managed project
pip install -qU langchain-anthropic langchain-openai langchain-google-genai   # providers
pip install -qU langchain-mcp-adapters                                        # MCP tools
```

Any LangChain chat model that supports tool calling works; the simplest selector is
`"provider:model"`.

## Full signature (reference)

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="openai:gpt-5.4",
    tools=[], system_prompt="...", middleware=[], subagents=[], skills=[], memory=[],
    response_format=None, checkpointer=None, backend=None, interrupt_on=None,
    debug=False, name="deep-agent",
)
```

## Backend trust boundaries

`deep-agents-memory` covers `StateBackend`, `StoreBackend`, `FilesystemBackend`, and
`CompositeBackend`. Two rules it does not state outright:

- **`FilesystemBackend(root_dir=..., virtual_mode=True)`** — always prefer `virtual_mode`
  and keep secrets outside the allowed root.
- **`LocalShellBackend`** — real filesystem **plus host shell execution**. Development-only
  and high risk; never enable it without `interrupt_on` approval on `execute`.

## HITL needs a checkpointer, and resume happens on the same thread

```python
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

agent = create_deep_agent(
    checkpointer=MemorySaver(),
    interrupt_on={
        "write_file": {"allowed_decisions": ["approve", "reject"]},
        "execute": {"allowed_decisions": ["approve", "edit", "reject"]},
    },
)
config = {"configurable": {"thread_id": "job-7"}}
first = agent.invoke({"messages": [...]}, config=config, version="v2")
second = agent.invoke(Command(resume=[{"decision": "approve"}]), config=config, version="v2")
```

Narrow `allowed_decisions` for lower-risk tools when editing should not be possible.

## Skills vs memory

`skills=["./skills/<name>"]` loads progressive-disclosure procedures on matching intent;
`memory=["AGENTS.md", "TEAM_GUIDELINES.md"]` is always-available project knowledge. Do not
collapse both into one system prompt.

## Framework selection

| Need | Use |
| --- | --- |
| Fast path to a capable coding or ops agent | Deep Agents |
| Custom retry loops, branching, supervisor-owned state | LangGraph (`langgraph-fundamentals`) |
| Simple single-agent tool use | LangChain `create_agent` (`langchain-fundamentals`) |
| Durable workflow plus specialist harness | LangGraph outside, Deep Agents inside specialist nodes |

When routing becomes graph-shaped, move orchestration to LangGraph and keep Deep Agents as
the tool-heavy specialist.

## Links

- https://docs.langchain.com/oss/python/deepagents/overview
- https://docs.langchain.com/oss/python/deepagents/backends
- https://docs.langchain.com/oss/python/deepagents/human-in-the-loop
- https://docs.langchain.com/oss/python/deepagents/skills
