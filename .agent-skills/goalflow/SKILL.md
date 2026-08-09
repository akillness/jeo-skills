---
name: goalflow
description: >
  Route goalflow (wanmol/goal-flow) work — a LangGraph framework that combines
  workflow graphs with agent loops — into exactly one mode: fit check,
  transpiling a Dify DSL export into runnable LangGraph Python, authoring
  workflow nodes and edges, building an `agent_kit` loop with middleware and a
  harness, wiring the serving layer (data adapters, SSE streaming, HITL,
  Redis/MySQL, API-key registration), or running the pre-publish security
  gate. Use when the user wants Dify's visual design without Dify's runtime, a
  graph node that hosts an agent loop, an OpenAI-compatible wire protocol over
  their own workflows, or prompt-injected `SKILL.md` capabilities. Triggers
  on: goalflow, goal-flow, dify to langgraph, dify transpiler, dify DSL
  export, BaseWorkflow, agent_kit, AgentBaseNode, DataAdapter, chunk
  processor, HITL interrupt, dify2langgraph. Route plain graph-API questions
  to `langgraph-fundamentals` and `langgraph-workflow`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python 3.12, plus Redis (cache, conversation variables, stop flags) and
  MySQL (durable messages, HITL reviews, and the LangGraph checkpointer).
  `src/` layout with two packages: `goalflow` and the vendored `agent_kit`.
  MIT. Defaults lean toward Qwen/DashScope and Alibaba Cloud OSS because the
  project was extracted from an internal production system.
metadata:
  tags: goalflow, goal-flow, langgraph, dify, dify2langgraph, transpiler, agent-loop, agent-kit, middleware, hitl, sse-streaming, data-adapter, llmops, python
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/wanmol/goal-flow
---

# goalflow — Graph-Orchestrated Agent Loop

goalflow gives you two ways to build LLM applications on LangGraph and lets
you combine them: **visual-first** (design in Dify, transpile the exported DSL
into a LangGraph Python file you own) and **code-first** (ReAct/Deep agent
loops via the vendored `agent_kit`). A `graph` node can host an `agent` loop,
and an agent can call sub-workflows as tools.

Two things shape almost every answer about this project:

1. It is **extracted from an internal production system**. The generalizable
   core is real; the defaults are opinionated (Qwen/DashScope, Alibaba OSS).
2. Its own docs open with a **CAUTION**: live credentials remain in git
   history. That is a blocker before any public push, not a footnote.

## When to use this skill

- Converting a Dify flow into version-controlled LangGraph code without
  staying on Dify's runtime
- Choosing or authoring workflow nodes, edges, branch routing, or
  iteration/loop subgraphs
- Building an agent loop with `agent_kit` — graph builder, middleware chain,
  harness/model router, executable skills
- Wiring the serving layer: data adapters, SSE streaming, HITL interrupts,
  Redis/MySQL, and workflow registration
- Authoring `SKILL.md` capabilities that get LLM-matched and injected into
  prompts
- Auditing the repo before publishing it or deploying it anywhere real

## When not to use this skill

- Plain LangGraph graph/state/checkpointer API questions →
  `langgraph-fundamentals`, `langgraph-workflow`, `langgraph-persistence`
- Generic LangChain chains, retrievers, or RAG design → `langchain-fundamentals`,
  `langchain-rag`
- Generic HITL patterns not tied to this engine → `langgraph-human-in-the-loop`
- `deepagents` used directly, outside `agent_kit`'s wrapper → `deepagents`
- Authoring skills for *this* repo's agent catalog rather than goalflow's
  runtime → `skill-standardization`, `write-a-skill`
- LLM tracing/eval platform selection → `langsmith`, `opik`

## Instructions

### Step 1: Capture the intake packet

Four facts decide the mode:

1. **Starting artifact** — a Dify DSL export, an empty repo, an existing
   `BaseWorkflow` subclass, or a running deployment
2. **Target shape** — a workflow graph, an agent loop, or a graph node that
   hosts a loop
3. **Client protocol** — Dify-native (default), OpenAI-compatible, or custom
4. **Environment reality** — is Redis and MySQL actually available? MySQL
   backs the checkpointer, and the checkpointer is what makes stop/resume and
   HITL work at all

### Step 2: Pick exactly one mode

| Mode | Use when | Produces |
|---|---|---|
| `orient` | It is unclear goalflow is the right tool | A fit verdict, or an honest route-out to plain LangGraph |
| `transpile` | A Dify DSL export exists | A generated `BaseWorkflow` subclass, registered and runnable |
| `build` | Authoring or fixing the graph itself | Node choices, edge/branch routing, error strategy |
| `agent` | The job is an open-ended tool-use loop | An `Agent`/`AgentBaseNode` with builder, middleware, harness |
| `serve` | Wiring the runtime to clients | Adapter, endpoints, streaming, HITL, storage, registration |
| `harden` | Before publishing or deploying | A blocker list from the pre-publish gate |

Run `harden` before any push to a public or shared remote, regardless of which
mode the user asked for.

### Step 3: Check the environment read-only

```bash
bash .agent-skills/goalflow/scripts/goalflow.sh doctor
bash .agent-skills/goalflow/scripts/goalflow.sh doctor /path/to/goal-flow
```

`doctor` reports Python version, the core packages (`langgraph`, `fastapi`,
`redis`, `pymysql`, `sqlalchemy`, `langchain-openai`), whether `goalflow` and
`agent_kit` import, and which `.env` keys are set — **by name only, never by
value**. It installs nothing and starts no server.

### Step 4: Transpile before hand-writing a graph

The transformer is a two-stage pipeline: parse the DSL into an internal graph
model, then emit Python via a double-dispatch visitor.

```bash
python -m goalflow.tool.dify_transformer.wf_transformer_tool \
  --dsl path/to/my_flow.yml \
  --out my_flow_workflow.py \
  --class MyFlowWorkflow
```

Two facts that prevent the common mistakes:

- The parse is **read-only**. Host-portability rewrites happen on an in-memory
  copy; your export file is never modified.
- The substitution table is `DifyDslParser.DEFAULT_HOST_SUBSTITUTIONS`. It
  encodes the *original authors'* internal hostnames. Pass your own
  `host_substitutions=`, or `{}` to disable it — do not inherit theirs.

Generation is only half the job. A generated class does nothing until it is
registered (Step 6). Details in
[references/dify-transpile.md](references/dify-transpile.md).

### Step 5: Author nodes against the real `BaseNode` contract

You implement exactly one method, `call(self, state)`, and its return type
encodes both state update *and* routing:

| Return | Meaning |
|---|---|
| `dict` | merge into state, continue to `next_node_ids` |
| `Command(update=, goto=)` | update and jump |
| `List[str]` | branch routing — pick outgoing handles |
| `Sequence[Send]` | fan out, one parallel branch per `Send` |
| `None` | no update |

The `__call__` wrapper gives you timing, logging, and a **fan-in barrier** for
free: a node with multiple `pre_node_ids` re-queues itself until its
topological depth is reached, so it runs once after all upstream branches
arrive. Do not hand-roll that.

Node catalog, error strategies, and the iteration/loop caps live in
[references/nodes-and-graph.md](references/nodes-and-graph.md).

### Step 6: Register the workflow, and say what registration really is

```python
# src/goalflow/api/auth_validator.py
apikey_workflow_def_map = {
    "2999a65aa67e37253623075d60796f9a": MyWorkflow,  # md5(api_key)
}
```

This is a **static in-code map keyed by the MD5 of the API key**. Upstream
documents it as the current design and the first thing to replace for a real
deployment. MD5 is unsuitable for hashing secrets. When a user asks how to
register a workflow, answer the question *and* flag this — do not present it
as a production auth story.

### Step 7: Prefer `AgentBaseNode` for agent work

`AgentBaseNode` multiply-inherits the workflow `BaseNode` and `agent_kit`'s
`Agent`. Subclass it and implement `output_schema`, `build_prompt`, and
`build_command`. It supersedes `DeepAgentBaseNode`, `CreateAgentBaseNode`, and
`StateGraphBaseNode`, and it is the preferred path over the older manual
`AgentNode` ReAct loop.

The builder is auto-selected: `DeepGraphBuilder` when `subagents` are present,
`ReactGraphBuilder` otherwise. Middleware runs in list order.

[references/agent-kit.md](references/agent-kit.md) has the hooks, the
middleware catalog, and the harness/model-router contract.

### Step 8: Keep protocol changes in the adapter layer

The engine emits protocol-neutral semantic events; a `DataAdapter` is the last
hop that serializes them. To add a protocol, implement `generate()` (streaming)
and `execute()` (blocking) — you never touch the engine, nodes, or graph.

`DifyDataAdapter` is an identity passthrough, because the internal format
already *is* the Dify protocol. `OpenAIDataAdapter` backs `/v1/chat/completions`.

Streaming is branch-aware: tokens from an untaken `if-else` or classifier
branch are pruned before they ever reach the client. Details in
[references/serving-and-protocols.md](references/serving-and-protocols.md).

### Step 9: Run the pre-publish gate before any push

```bash
python3 .agent-skills/goalflow/scripts/preflight_audit.py /path/to/goal-flow
```

Stdlib-only. It runs the upstream checklist deterministically: tracked
`.env*`/key/log files, **`.env*` blobs still reachable in git history**,
hard-coded internal IPs and endpoints, `.gitignore` coverage, `LICENSE`
presence, the open-CORS-with-credentials combination, the MD5 auth map, and
`CodeNode`'s `exec` path. It prints one ` ```review ` fenced JSON block and
exits `1` on a blocker.

The non-negotiable rule it encodes: untracking `.env` does **not** remove it
from history. Rotate every credential *and* scrub history with
`git filter-repo`, then push to a **fresh** remote — never one that already
carries the secrets.

The published `wanmol/goal-flow` history is already scrubbed (only
`.env.example` survives), so this check is usually clean there. It matters for
**internal forks, mirrors, and clones that predate the scrub**, which is where
the original credentials still live.

Full checklist in [references/security-gate.md](references/security-gate.md).

### Step 10: Author runtime skills with the injection cost in mind

goalflow has two skill systems. The main-project engine
(`src/goalflow/skill/`) matches a `SKILL.md` to a query with an **LLM** (not
keywords; default `qwen-turbo`, threshold `0.3`, `top_k` 1) and injects the
Markdown body verbatim into the system prompt. `agent_kit`'s engine adds
*executable* skills (`module:func` as a LangChain tool) and hybrid mode.

```bash
python3 .agent-skills/goalflow/scripts/check_goalflow_skill.py skills/weather_query
```

Because bodies are injected verbatim, body length is prompt cost on every
matched turn — the checker warns on oversized bodies and on the `description`
being too vague for the matcher to reason over.

[references/skills-engine.md](references/skills-engine.md) covers frontmatter,
matching, and the choice between the two engines.

## Best practices

1. **Transpile, then own the code.** The point is escaping Dify's runtime; do
   not keep round-tripping through the DSL as the source of truth.
2. **Replace the host-substitution table.** Inheriting the upstream authors'
   internal hostnames silently rewrites your URLs.
3. **Never present the MD5 API-key map as production auth.** Answer the
   registration question, then flag it.
4. **Treat `CodeNode` input as trusted-only.** It `exec`s DSL/model-provided
   Python and the AST `safe_check()` guard is disabled upstream. Do not accept
   untrusted DSLs without re-enabling and strengthening sandboxing.
5. **Do not promise HITL or stop/resume without MySQL.** The checkpointer is
   the backbone of both; no checkpointer means no durable pause.
6. **Prefer `AgentBaseNode` over `AgentNode`** and over the three deprecated
   bases.
7. **Put protocol work in an adapter, never in the engine.** If a change
   requires touching nodes to support a client, the design has drifted.
8. **Say when a default is Alibaba-shaped.** Qwen/DashScope, OSS, and Hologres
   defaults come from the project's origin, not from a recommendation.
9. **Run `preflight_audit.py` before any push to a shared remote**, and treat
   history-resident secrets as compromised rather than merely untracked.

## Examples

### Example 1: "I designed a flow in Dify, now what?"

`transpile` mode: run the transformer, override `host_substitutions`, register
the generated class in the API-key map, and flag that the map is a demo
mechanism.

### Example 2: "My branch's tokens leak to the client"

They should not — the chunk processor prunes untaken `if-else`/classifier
branches. Check whether the node provably reaches an `answer`/`end` node given
branches already taken, rather than patching the adapter.

### Example 3: "Can I run this without MySQL?"

Partially, and you must say which part breaks: MySQL backs the LangGraph
checkpointer, so stop/resume and HITL stop being durable.

### Example 4: "We're about to open-source our fork"

`harden` mode first. Run `preflight_audit.py` against **your** checkout — a
clean `git status` says nothing about what a clone can still recover, and a
fork that predates upstream's scrub carries the original credentials.

### Example 5: "Should I use goalflow or just LangGraph?"

`orient` mode. If there is no Dify design to transpile, no need for a
swappable wire protocol, and no graph-hosting-a-loop requirement, plain
LangGraph is lighter — route out and say so.

## References

- [references/dify-transpile.md](references/dify-transpile.md) — two-stage pipeline, CLI flags, host substitutions, generated anatomy
- [references/nodes-and-graph.md](references/nodes-and-graph.md) — `BaseNode` contract, `NodeOutput` union, fan-in, error strategies, full node catalog
- [references/agent-kit.md](references/agent-kit.md) — `Agent` hooks, graph builders, middleware catalog, harness/model router, executable skills
- [references/skills-engine.md](references/skills-engine.md) — `SKILL.md` frontmatter, LLM matching, prompt injection, main vs `agent_kit` engines
- [references/serving-and-protocols.md](references/serving-and-protocols.md) — endpoints, data adapters, three-layer streaming, HITL, storage and config
- [references/security-gate.md](references/security-gate.md) — the pre-publish checklist and what each finding actually costs
- [scripts/goalflow.sh](scripts/goalflow.sh) — read-only `doctor`, plus `audit` and `check-skill` passthroughs
- [scripts/preflight_audit.py](scripts/preflight_audit.py) — stdlib-only pre-publish security gate
- [scripts/check_goalflow_skill.py](scripts/check_goalflow_skill.py) — stdlib-only runtime-`SKILL.md` frontmatter and injection-cost check
- [goalflow GitHub Repository](https://github.com/wanmol/goal-flow)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
