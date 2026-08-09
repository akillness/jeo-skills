# Nodes and the graph

Every node subclasses `BaseNode` (`src/goalflow/node/base.py`) and is a
LangGraph-callable. The type registry is `WfNodeType` in `constants.py`; each
type maps 1:1 to a Dify node type string, which is how the transpiler knows
which class to emit.

## What you implement

Exactly one method:

```python
def call(self, state: GenericState) -> NodeOutput: ...
```

`NodeOutput` encodes **both** state update and routing:

| Return type | Meaning |
|---|---|
| `dict` / `TypedDict` | merge keys into state, continue to `next_node_ids` |
| `Command(update=..., goto=...)` | update state and jump to specific node(s) |
| `List[str]` | branch routing — pick these outgoing handles |
| `Sequence[Send]` | fan out (map-reduce), one parallel branch per `Send` |
| `None` | no update |

## The `__call__` lifecycle you get for free

1. Record `start_time` and log **node started** with `step`, `node_level`,
   `wf_name`, `node_type`, `node_id`, `node_title` (plus `iteration_round`
   when `isInIteration`).
2. `pre_call(state)` — the **fan-in barrier**. If the node has more than one
   `pre_node_ids` and has not reached its topological depth
   (`node_level >= step + 1`), it returns
   `Command(update={"step": step+1}, goto=[self.id])` to re-queue itself, so
   it truly runs only once every upstream branch has arrived. `END` and
   `ANSWER` skip this.
3. `self.call(state)` — your logic.
4. From the returned `Command`: `goto` → `next_node_ids`, `update` → `output`;
   `output` passes through `truncate_output_value`; `cost_time` computed; logs
   **node finished**.
5. Bumps `step` into `value.update` and returns — **except** `END` / `ANSWER`,
   which return raw output without bumping `step`.
6. On exception → re-raise; the outer runner emits an error event to the client.

Do not reimplement fan-in, timing, or truncation inside `call()`.

## Key attributes

`id`, `title`, `desc`, `type`, `variables`, `error_strategy`, `default_value`,
`pre_node_ids`, `next_node_ids`, `fail_branch_node_ids`, `parent_node_id`,
`node_level`, `wf_name`, and the loop/iteration flags `isInIteration`,
`isInLoop`, `iteration_id`, `loop_id`.

## Error strategy

From the Dify config, per node:

- `default-value` — on failure emit `default_value` and continue normally
- `fail-branch` — on failure emit `source_handle="fail-branch"` and route to
  `fail_branch_node_ids`

Choose `fail-branch` when the failure needs different downstream handling;
choose `default-value` when a placeholder keeps the flow meaningful.

## Node catalog

### Flow control

| Node | Type | Purpose |
|---|---|---|
| `StartNode` | `start` | Entry. Validates declared inputs (required/type/select/default), seeds `input_variables`, loads `conversation_variables` from DB, exposes `sys.query` |
| `EndNode` | `end` | Terminal. Resolves output selectors, returns `{"outputs": ...}`. Does not bump `step` |
| `AnswerNode` | `answer` | Chatflow terminal. Interpolates a text template with variable chunks and streams it via `AnswerEndStreamOutRouter` |
| `IfElseNode` | `if-else` | Ordered cases via `ConditionProcessor`; routes by `selected_case_id`, falling back to `"false"` |
| `ClassifierNode` | `question-classifier` | LLM picks a category; routes via `source_handle_target_map[category_id]` |

### Data and transform

| Node | Type | Purpose |
|---|---|---|
| `CodeNode` | `code` | Sandboxed Python via `exec` with restricted `__builtins__`. Requires a `main()` returning a dict; output filtered to declared `outputs` |
| `TemplateTransformNode` | `template-transform` | Renders a Jinja2 template to `output` |
| `AggregatorNode` | `variable-aggregator` | First non-null across `variable_selectors`; grouped mode via `advanced_settings` |
| `AssignerNode` | `assigner` | Variable ops (over-write/append/extend/add/subtract/clear/set …). Persists conversation variables to DB |
| `DocExtractorNode` | `document-extractor` | Extracts text by MIME type (pdf, docx, xlsx, ppt, epub, eml, csv, …) |

> `CodeNode` executes DSL- or model-provided Python. The parser's `safe_check()`
> AST guard is disabled/TODO upstream. Treat its input as **trusted only**.

### LLM and agents

| Node | Type | Purpose |
|---|---|---|
| `LLMNode` | `llm` | Core LLM call. Builds a prompt from `model` / `prompt_template` / `memory` / `context` / `vision`, streams, supports JSON extraction and error strategy |
| `AgentNode` | `agent` | Manual ReAct loop: binds tools to an Azure/Tongyi LLM, runs `handle_tool_calls`, second call for the final answer, up to 3 retries |
| `AgentBaseNode` | (base) | Preferred. Built on `agent_kit`'s `Agent` + graph builders — see `references/agent-kit.md` |

### External and retrieval

| Node | Type | Purpose |
|---|---|---|
| `HttpRequestNode` | `http-request` | Templated request (url/headers/params/body), SSE support, retry/timeout, fail-branch/default-value |
| `ToolNode` | `tool` | Executes a bound tool per `tool_provider_config` with exponential-backoff retry (non-retryable: `ValueError`, `TypeError`, …) |
| `KnowledgeRetrievalNode` | `knowledge-retrieval` | **Deprecated stub** returning an empty result; kept for graph compatibility. Do not build retrieval on it |

### Iteration and loop

| Node | Type | Purpose |
|---|---|---|
| `IterationNode` (+ `IterationStartNode`) | `iteration` | Inner `StateGraph`, fans out over `iterator_selector` using `Send` (supports `parallel_nums` / `is_parallel`), collects `output_selector` |
| `LoopNode` (+ `LoopStartNode`, `LoopEndNode`) | `loop` | Runs a subgraph up to `loop_count` (**hard cap 10**), resets `step=0` each pass, checks `break_conditions`. `LoopEndNode` can signal early exit |

The loop cap of 10 is a hard limit, not a default — design around it rather
than raising expectations about long iterative flows.

### Custom node examples (`src/goalflow/node/custom/`)

| Node | Type | Purpose |
|---|---|---|
| `NaturalLanguageQueryNode` | `nl_db_query` | Full text-to-SQL ReAct subgraph: list tables → get schema → generate SQL → check → run |
| `SensitiveWordCheckNode` | `sensitive_word_check` | Runs `text_to_img_check`; outputs `passed` / `status` |

## Adding a node type

1. Subclass `BaseNode[YourState]` and implement `call(self, state)`.
2. Add a `WfNodeType` entry in `src/goalflow/constants.py` if it maps to a new
   Dify type.
3. Export it from `src/goalflow/node/__init__.py`.
4. Add a `visit_<type>` handler in `src/goalflow/visitor/node_visitor.py` so
   the transpiler can emit it.

Skipping step 4 means the node works when hand-written but silently falls back
to `visit_generic` when transpiled.

For agent-style nodes, subclass `AgentBaseNode` rather than copying the manual
`AgentNode` loop.

## From nodes to a running graph

The transpiler generates a `BaseWorkflow` subclass whose `_setup_nodes`
constructs the node objects and `_setup_edges` builds the `GraphEdge`s.
`BaseWorkflow.__init__` runs both, adds nodes to a LangGraph `StateGraph`,
assigns levels via `_analysis_node_level`, and compiles with the MySQL
checkpointer.
