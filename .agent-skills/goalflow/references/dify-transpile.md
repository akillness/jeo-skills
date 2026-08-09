# Dify DSL → runnable LangGraph workflow

LangGraph has no visual designer; Dify has an excellent one but locks you into
its runtime. The transformer bridges them: design visually, export, transpile,
and run on goalflow's engine with code you own and can diff.

## The two-stage pipeline

```
Dify DSL (.yml)
   │
   ▼
[1] src/goalflow/dify_parser/  ──►  DifyDslDefinition / DifyWorkflow
   │
   ▼
[2] src/goalflow/tool/dify_transformer/ + src/goalflow/visitor/node_visitor.py
   │
   ▼
src/goalflow/workflow/generated/<name>.py
```

### Stage 1 — parse

`DifyDslParser(dsl_path).parse() -> DifyDslDefinition`

1. Applies host-portability rewrites **on an in-memory copy** — hard-coded
   internal service URLs become `os.environ[...]` references. The parse is
   read-only; your export file is never modified.
2. Loads YAML with `CSafeLoader`, builds `DifyDslDefinition` from `app`,
   `dependencies`, and `workflow`.
3. `_parse_workflow` reads `conversation_variables`, `environment_variables`,
   and `graph.{nodes,edges}`; each node becomes a typed `Dify*NodeData`, each
   edge a `DifyGraphEdge`.
4. `DifyWorkflow.init_graph_data()` builds `node_map`, the single
   `start_node_id` (errors on none or multiple), `parent_children_node_map`
   for iteration/loop subgraphs, and both edge-direction maps.

Key modules: `dify_parser/dify_app.py` (`DifyWorkflow`, `DifyDslDefinition`,
`DifyAppNode`) and `dify_parser/dify_types.py` (all `Dify*NodeData`, enums).

> **The substitution table is not yours.**
> `DifyDslParser.DEFAULT_HOST_SUBSTITUTIONS` is a `{old: new}` dict encoding
> the original authors' internal hostnames. Pass `host_substitutions=` to
> override it, or `{}` to disable rewriting entirely. Inheriting it silently
> rewrites URLs in your flow to hosts that do not exist for you.

### Stage 2 — generate

`WorkflowCodeGenerator(dsl_path, *, file_name="workflow.py", class_name=None, out_path=None)`

- `generate()` parses, wires a `DifyNodeVisitor`, calls `do_generate()`,
  writes the file, and returns the path written. Defaults to
  `src/goalflow/workflow/generated/`.
- The visitor is classic double dispatch: `visit(node)` reads
  `WfNodeType.value_of(node.data.type)` and dispatches to `visit_start`,
  `visit_llm`, `visit_code`, `visit_if_else`, `visit_iteration`, `visit_loop`,
  `visit_tool`, `visit_answer`, `visit_end`, `visit_classifier`,
  `visit_knowledge_retrieval`, `visit_assigner`, `visit_agent`,
  `visit_template_transform`, `visit_variable_aggregator`,
  `visit_doc_extractor`, falling back to `visit_generic`.
- It appends **Python source strings**, not objects: node constructors into
  `node_code_fragments`, edges into `edge_code_fragments`. `_process_edges`
  computes `next_node_ids`, `fail_branch_node_ids`, and
  `source_handle_target_map` (branch routing for if/else and classifier).
- `do_generate` maps `app.mode` to `WF_TYPE_WORKFLOW` / `WF_TYPE_CHATFLOW`,
  emits imports, and templates the class.

## Running it

```bash
python -m goalflow.tool.dify_transformer.wf_transformer_tool \
  --dsl path/to/my_flow.yml \
  --out my_flow_workflow.py \
  --class MyFlowWorkflow
```

| Flag | Required | Behavior |
|---|---|---|
| `--dsl` | yes | Path to the export; validated to exist. Missing → non-zero exit |
| `--out` | no | Filename, directory, or full path. Bare filename lands in `generated/` |
| `--class` | no | Generated class name |

Batch transpiling from Python:

```python
from goalflow.tool.dify_transformer.wf_code_generator import WorkflowCodeGenerator

written = WorkflowCodeGenerator(
    "path/to/my_flow.yml",
    file_name="my_flow_workflow.py",
    class_name="MyFlowWorkflow",
).generate()
```

## Anatomy of the generated class

```python
class MyFlowWorkflow(BaseWorkflow[BaseState]):
    def _setup_environment_variables(self): ...   # rehydrate EnvironmentVariable
    def _setup_conversation_variables(self): ...  # rehydrate ConversationVar

    def _setup_nodes(self):
        common_args = self._fix_common_args(...)
        start = StartNode(id="start", **common_args, ...)
        self.nodes.append(start)
        self.graph.add_node("start", start)
        # ... one block per node

    def _setup_edges(self):
        self.append_edge(GraphEdge(
            id="e1", source="start", source_handle="source",
            target="if-1", target_handle="target",
            source_type="start", target_type="if-else",
            is_in_iteration=None, is_in_loop=None,
        ))
```

`BaseWorkflow.__init__` reads `state_schema` from the generic parameter,
creates the `StateGraph`, and via `build_graph` / `_analysis_node_level`
assigns node levels and compiles the graph.

## Registration is a separate step

A generated class is inert until it is mapped to an API key in
`src/goalflow/api/auth_validator.py`. See `SKILL.md` Step 6 — and note that
the map is keyed by the **MD5 of the API key**, which upstream itself flags as
a demo mechanism to replace.

## Supporting other visual builders

The parser and generator are separated by the internal graph model. To support
a builder other than Dify, write a parser producing the same
`DifyWorkflow`/graph-model shape; the existing visitor and generator emit code
unchanged. This is the intended extension path.

## Common failure modes

| Symptom | Cause |
|---|---|
| URLs point at hosts you have never heard of | Inherited `DEFAULT_HOST_SUBSTITUTIONS` |
| Parser errors on start node | The DSL has zero or multiple start nodes |
| A node type transpiles to `visit_generic` | No `visit_<type>` handler — add one to `node_visitor.py` |
| Generated file runs but is never reached | Class not registered in `apikey_workflow_def_map` |
| Branch routing wrong after edit | `source_handle_target_map` is computed at generation; re-transpile rather than hand-patching edges |
