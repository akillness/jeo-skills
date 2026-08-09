# Serving: protocols, streaming, HITL, storage

## Where the adapter sits

```
BaseWorkflow.stream() ──► StreamProcessor ──► semantic events ──► DataAdapter ──► SSE / JSON
```

The generate service produces protocol-neutral lifecycle chunks and semantic
events (`NodeRunStreamChunkEvent`, `NodeRunSucceededEvent`,
`NodeRunInterruptEvent`, `NodeRunControlEvent`, `ProxyStreamDataChunk`). The
adapter is the last hop that turns those into client bytes.

**The rule:** because the adapter sees only the neutral event stream, adding a
protocol never touches the engine, the nodes, or the graph. If a protocol
change is making you edit a node, the design has drifted.

## The adapter contract

```python
class AbstractDataAdapter(ABC):
    @abstractmethod
    def generate(self, generator: Generator[str, None, None]) -> Generator[str, None, None]:
        """Streaming: transform the engine's chunk stream into wire frames."""

    @abstractmethod
    def execute(self, data: ChatCompletionBlockingResponse) -> dict:
        """Blocking: transform a single response into the wire shape."""
```

Both are abstract, so a subclass must implement both to be instantiable.
`app.py` calls `.generate()` for streaming and `.execute()` for blocking.

| Adapter | Shape |
|---|---|
| `DifyDataAdapter` | Identity passthrough — the internal format already *is* the Dify protocol. It exists so every supported protocol has a concrete, discoverable adapter |
| `OpenAIDataAdapter` | OpenAI Chat Completions: `chat.completion.chunk` streaming, `chat.completion` blocking. Backs `POST /v1/chat/completions` |

To add one: subclass under
`src/goalflow/workflow/services/data_adapter/`, implement both methods, map
each semantic event to your frame format, then point an endpoint at it in
`app.py`.

## The three-layer streaming pipeline

```
BaseWorkflow.stream()        LangGraph raw (mode, event) tuples
        │                    modes: "updates" | "messages" | "custom"
        ▼
StreamProcessor              raw tuples ─► semantic events
        │
        ▼
GenerateService.generate()   semantic events ─► lifecycle chunks (+ Redis stop check)
        │
        ▼
DataAdapter ─► SSE frames
```

**Layer 1 — engine.** `BaseWorkflow.stream(initial_state, config, stream_mode)`
wraps LangGraph's `compiled_graph.stream(...)`, running with
`recursion_limit=500`, `max_concurrency=6`, trace metadata, and a `thread_id`
(the checkpoint key). `messages` carries LLM tokens, `updates` carries
node-completion snapshots, `custom` carries interrupts and control events.

**Layer 2 — chunk processors.** `WorkflowStreamProcessor` routes tokens toward
`end` nodes; `ChatflowStreamProcessor` routes toward `answer` nodes and also
handles interrupts, control events, and passthrough.

*Branch-aware streaming is the clever part.* On a `messages` event the
processor reads `metadata["langgraph_node"]` to find the emitting node, then
checks whether that node **provably reaches** an `answer`/`end` node given the
branches already taken. `_remove_dependencies` prunes edges from branch nodes
(`if-else`, `question-classifier`, `fail-branch`) so a token from an *untaken*
branch is never streamed. If untaken-branch tokens leak, debug here — not in
the adapter.

It also separates reasoning-tag content (`THINK_START_TAG` / `THINK_END_TAG` →
`reasoning_content`) and extracts token usage when `finish_reason == "stop"`.

**Layer 3 — generate services.** `WorkflowGenerateService.generate()` /
`ChatflowGenerateService.generate()` set the `request_id` contextvar, assign
`sys_workflow_run_id`, yield `workflow_started`, build the `RunnableConfig`,
map semantic events to client chunks (`NodeRunSucceededEvent` →
`node_finished`, `NodeRunStreamChunkEvent` → `text_chunk`), and every
`STREAM_OUTPUT_STOP_CHECK_INTERVAL` chunks poll a Redis stop flag.

## Endpoints

Auth: `Authorization: Bearer <key>`; the key is MD5-hashed and looked up in
`apikey_workflow_def_map`.

### Chat and workflow

| Endpoint | Purpose |
|---|---|
| `POST /v1/chat-messages` | Run a **chatflow**. Streaming (`text/event-stream`, `X-Workflow-Run-ID` header) or blocking |
| `POST /v1/chat-messages/{task_id}/stop` | Set the Redis stop flag so the stream terminates |
| `POST /v1/workflows/run` | Run a **workflow** (non-chat) |
| `POST /v1/chat/completions` | OpenAI-compatible, via `OpenAIDataAdapter` |
| `POST /v1/images/generations` | Generate, watermark, upload to OSS, return CDN URL. Needs image-gen + `OSS_PUBLIC_*` config |

`WorkflowInput` body: `query`, `user` (**required**), `conversation_id`
(omit to start a new conversation), `response_mode` (`streaming` | `blocking`),
`scene_type`, `sys_app_id`, `sys_workflow_id`, `files`, `inputs`.

Lifecycle chunk types: `workflow_started`, `node_finished`, `text_chunk`,
`error`, `done`.

### Suggested questions

`POST` / `GET /v1/messages/{message_id}/suggested` — follow-up suggestions
from recent history; `user` query param required; `tpl_id` selects a prompt
template.

### HITL — prefix `/api/v1/hitl`

| Path | Purpose |
|---|---|
| `GET /reviews/{review_id}` | Review detail |
| `GET /workflows/{workflow_run_id}/reviews` | All reviews for a run |
| `POST /reviews/approve` | Approve (resumes the workflow) |
| `POST /reviews/modify` | Approve with modifications |
| `POST /reviews/reject` | Reject |
| `POST /workflows/{workflow_run_id}/resume` | Manually resume |
| `GET /health` | HITL health |

### Reports — prefix `/v1/reports`

`POST /list`, `POST /detail`, `POST /versions`.

### Health

`GET /`, `GET /health`, `GET /middle_health` (Redis/MySQL),
`GET /memory-intensive`, plus memory diagnostic routers.

## Human-in-the-loop

**Pause:** a node raises a LangGraph interrupt. Because the graph is compiled
with a **MySQL checkpointer keyed by `thread_id`**, full state is persisted at
the interrupt point. The processor surfaces a `NodeRunInterruptEvent`, which
the service streams so the client learns what input is needed.

**Resume:** the client posts the decision to the HITL API;
`BaseWorkflow.resume(resume_data, config)` issues a LangGraph
`Command(resume=...)` against the same `thread_id`, continuing from exactly
where it paused — earlier nodes are not re-run. Decisions (`approve` /
`reject` / `modify`) are persisted via `db/hitl_review.py`.

**Control events:** `NodeRunControlEvent` (from `custom` mode) can tell the
frontend to clear current output and regenerate — useful when a HITL
correction invalidates what was already streamed.

**The dependency to state out loud:** the checkpointer
(`langgraph-checkpoint-mysql`, managed by
`workflow/utils/checkpointer_manager.py`) is the backbone of both stop/resume
and HITL. No MySQL means no durable pause.

## Configuration

Two sources:

- **`config.yaml`** — non-secret: environment name, logging, server
  host/port/CORS. Loaded by `goalflow.config::ConfigManager`.
- **`.env` files** — secrets and endpoints, loaded by
  `goalflow.tool.env_loader::load_env()` based on `ENV`:

| `ENV` | File |
|---|---|
| `production` | `.env_prod` |
| `uat` | `.env_uat` |
| `test` | `.env_test` |
| anything else / unset | `.env` |

Minimum to boot the core engine: `FASTAPI_ENV`, the `MYSQL_*` block, the
`REDIS_*` block (or `REDIS_ENABLED=False`), and at least one LLM provider
(`DASHSCOPE_KEY` / `OPENAI_KEY` with endpoints). Tracing is optional —
`TRACE_SWITCH_ON=0` disables it.

Many other variables (OSS, MCP, Tavily, Hologres, ES, knowledge indexer,
Qianfan, Langfuse) are only needed when the corresponding node or tool is used.

## Running

```bash
pip install -e .        # installs goalflow + agent_kit
goalflow-server         # console script, port 8000
python start_server.py  # dev launcher, no install
uvicorn goalflow.app:app --host 0.0.0.0 --port 8000 --reload
```

Interactive docs at `http://localhost:8000/docs`. On startup, `lifespan` loads
env vars, initializes the MySQL pool and Redis cluster, runs a middleware
health check, and starts the memory monitor plus a periodic leak-check thread.
