# `agent_kit` — the vendored agent SDK

`agent_kit` is a framework-agnostic SDK for agent loops on LangGraph, vendored
at `src/agent_kit/` and importing as `agent_kit.*`. No submodules — a plain
clone is self-contained. It is MIT-relicensed as part of this project (see
`src/agent_kit/NOTICE.md`).

It exists because plain workflow graphs are good at explicit control flow and
plain agent loops are good at open-ended tool use, and neither covers
everything. The kit is designed to slot **into** a workflow as a node.

## The `Agent` class

`Agent[OutputT]` (`src/agent_kit/agent.py`) is the entry point. Subclass and
implement:

| Hook | Required | Purpose |
|---|---|---|
| `output_schema()` | yes | structured output type (Pydantic) |
| `build_prompt(state)` | yes | system prompt for this turn |
| `format_user_input()` | no | shape the user message |
| `format_output()` | no | post-process the final answer |

Construction accepts `model`, `tools`, `subagents`, `middleware=[...]`,
`graph_builder`, `harness`, and `cache_graph`.

**Model resolution (`_resolve_model`) is tri-state**, in priority order:

1. an explicit `BaseChatModel`
2. a model string (via `init_chat_model`)
3. the harness router (`harness.router.get(self.name)`)

`run(state, user_query, config)` compiles the graph, builds the prompt, drives
`graph.stream(stream_mode="messages")`, pushes each `AIMessageChunk` to
`config.configurable["stream_callback"]`, and returns the
`structured_response` (or the last AI text via `format_output`).

## Graph builders (agent topologies)

The `GraphBuilder` protocol (`src/agent_kit/graphs/base.py`) has one method:
`build(*, model, tools, middleware, output_schema, **extra)`.

| Builder | Wraps | Use for |
|---|---|---|
| `ReactGraphBuilder` (`react.py`) | `langchain.agents.create_agent` | standard ReAct tool-use loop (default) |
| `DeepGraphBuilder` (`deep.py`) | `deepagents.create_deep_agent` | sub-agents, memory (`AGENTS.md`), HITL `interrupt_on` |
| `CustomGraphBuilder` (`custom.py`) | your `builder_fn` | hand-built `StateGraph` |

`Agent` **auto-selects** `DeepGraphBuilder` when `subagents` are present
(injecting `SubAgentInitializeMiddleware`), otherwise `ReactGraphBuilder`. You
rarely need to pass `graph_builder` explicitly.

## Middleware pipeline

Middleware (`src/agent_kit/middleware/`) runs **in list order** and replaces
the older per-runtime hooks.

**Constraint / control**

| Middleware | Purpose |
|---|---|
| `EntryGuardMiddleware` | gate whether the agent runs at all |
| `ModelSkipMiddleware` | skip the model call under conditions |
| `ModelFailoverMiddleware` | fall back to another model on failure |
| `FallbackReplyMiddleware` | canned reply when everything fails |
| `SensitiveCheckMiddleware` | content safety |

**Enhancement**

| Middleware | Purpose |
|---|---|
| `ConversationHistoryMiddleware` | inject prior turns |
| `SkillAugmentationMiddleware` | match and inject skills |
| `MetricsMiddleware` | emit metrics |
| `StreamingBridgeMiddleware` | bridge tokens to the workflow's stream |
| `LangfuseTracingMiddleware` | tracing spans |

Plus `SubAgentInitializeMiddleware` and the factory
`make_dynamic_prompt_middleware`.

Order matters: put guards and skips before enhancement middleware, or you pay
for context injection on turns the guard would have rejected.

## Harness (governance container)

The `Harness` dataclass (`src/agent_kit/harness/`) is an injectable container
of cross-cutting services:

| Piece | Role |
|---|---|
| `HarnessSettings` (`settings.py`) | `LLMDefaults` (provider `qwen`, model `qwen-plus`, temp, timeout, retries), observability, fallback-reply settings |
| `ModelRouter` (`model_router.py`) | maps `task_type → LLM`. `register_llm_factory()` injects the LLM factory so the kit stays LLM-agnostic; `configure(task_type, ...)` sets per-task config; `get()` resolves with caching; `register_fallback_factory()` provides failover |
| `PromptRegistry` | named prompts |
| `HarnessProfile` / `ProfileRegistry` (`profiles.py`) | one call registers an LLM + sub-LLMs + prompts + `skills_dir` + skill-match params, fanning out to router and prompt registry |
| `tracer` | observability hook |

**Scope matters:** `default_harness()` binds to process-wide `HARNESS_*`
singletons (shared state). A bare `Harness()` is isolated — use that in tests
so one test's router config does not leak into another's.

## Executable skills

The kit's skill system (`src/agent_kit/skills/`) mirrors the main-project
engine but supports three modes:

- **prompt-only** — inject instructions (same as the main-project engine)
- **executable** — a `module:func` reference materialized as a LangChain
  `Tool` the agent can call
- **hybrid** — both

Enable via `SkillAugmentationMiddleware` or `HarnessProfile(skills_dir=...)`.

This is the deciding difference from the main-project engine: if a capability
must be *called*, not just described, it belongs here. See
`references/skills-engine.md`.

## Integration with the workflow layer

`src/goalflow/node/agent_base.py::AgentBaseNode(BaseNode, Agent[OutputT])`
multiply-inherits the workflow `BaseNode` and the kit's `Agent`, adding one
hook:

```python
def build_command(self, state, output) -> Command:
    """Translate the agent's output into a LangGraph Command (update + routing)."""
```

`BaseNode.call(state)` sets up a `stream_callback` via
`RunnableConfig.configurable`, guarded by a `ContextVar` for per-request
isolation, calls `Agent.run`, then `build_command`. It uses
`default_harness()` to share the `HARNESS_*` singletons, and
`src/goalflow/node/_harness_bootstrap.py::ensure_harness_wired()` (idempotent)
wires this repo's `LLM` factory, metrics, and Langfuse into them.

`AgentBaseNode` **supersedes** three deprecated bases: `DeepAgentBaseNode`,
`CreateAgentBaseNode`, and `StateGraphBaseNode`. To build a new agent node,
subclass `AgentBaseNode` and implement `output_schema`, `build_prompt`, and
`build_command`.

## Learning path

- `src/agent_kit/README.md` — the SDK-focused walkthrough
- `src/agent_kit/examples/` — `minimal_agent.py`, `conversation_agent.py`,
  `full_governance.py`, `harness_e2e.py`, `minimal_deep_agent.py`
- `src/agent_kit/tests/` — behavior specs per middleware and builder

Publishing the kit standalone (e.g. to PyPI) is on the roadmap; today it is
vendored, so treat `src/agent_kit/` as in-repo code you can patch, not a
pinned external dependency.
