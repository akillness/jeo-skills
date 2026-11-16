---
name: canyonos
description: >
  Deploy, observe, and scale multi-agent Python applications without decorators or SDK modifications using CanyonOS (v0.2.2). Use when converting plain Python, LangChain, or LangGraph projects into containerized agent replicas via .canyon and prepare.py; defining workflow topologies, entrypoints, and adapters; configuring state isolation, replicas, and autoscaling in scaling.yaml; managing LLM access and cost caps in llms.yaml; extracting versioned system prompts into prompts.yaml; generating OpenTelemetry metrics and traces; or running canyonos doctor, new-app, validate, deploy, status, test, logs, clean, and stop. Route Kubernetes-only CRD declarative cluster controllers to kagent, MCP application authoring to fastmcp, and LLM evaluation benchmarks to trulens or agent-evaluation.
allowed-tools: Bash Read Grep Glob Write Edit
metadata:
  version: 0.2.2
  source: https://github.com/CanyonCodeCoreAI/canyonos
  upstream_commit: 49e9bd042735aa88e694c9e1fc5069223ba19820
---

# CanyonOS

## When to use this skill

Use when deploying, instrumenting, observing, or scaling distributed multi-agent systems written in plain Python, LangChain, or LangGraph using CanyonOS v0.2.2. CanyonOS eliminates manual infrastructure setup by turning standard agent classes into containerized microservice topologies without altering existing source code.

Key scenarios include:
- Non-invasively converting an existing agent repository into a CanyonOS deployment using `prepare.py` and `.canyon`.
- Defining agent adapter contracts, callable `functions`, and the primary serving `endpoint` in `workflow_config.yaml`.
- Configuring stateful versus stateless replica boundaries, autoscaling rules in `scaling.yaml`, and LLM cost caps in `llms.yaml`.
- Extracting hardcoded LLM system instructions into managed, versioned `prompts.yaml`.
- Inspecting runtime health, logs, OpenTelemetry traces, and GPU utilization (`nvidia-smi` / `--gpus all`).
- Running the `canyonos` CLI lifecycle (`doctor`, `new-app`, `validate`, `deploy`, `status`, `test`, `logs`, `stop`, `clean`).

### Route-outs
- For managing declarative Kubernetes agent CRDs, controller reconcile loops, or gRPC A2A sessions directly, use `kagent`.
- For building, hosting, or consuming Model Context Protocol (MCP) servers and tools, use `fastmcp` or `mcp-builder`.
- For authoring in-process LangGraph state graphs or checkpoint persistence without container orchestration, use `langgraph-fundamentals`.
- For raw OpenTelemetry collector pipelines or Prometheus scrapers without CanyonOS, use `agent-observability`.
- For measuring LLM output quality, hallucinations, or RAG Triad scores, use `trulens` or `agent-evaluation`.

---

## Instructions

### 1. Offline environment preflight

Before creating directories or invoking container commands, verify the local environment using the offline manifest helper:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
```

To compare an existing CanyonOS source checkout against the pinned 12-file manifest:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json --repo /absolute/real/path/to/canyonos
```

The preflight script performs non-executing path discovery for `python3`, `uv`, `docker`, `canyonos`, and `git`, strictly validating source bytes without starting daemons or accessing the network.

### 2. Scaffold or convert an existing Python agent project

#### Scaffolding a new project
```bash
canyonos new-app my-agents
cd my-agents
```
This generates standard agent classes in `agents/` and a central `workflow.py`.

#### Converting an existing repository
Run the upstream conversion helper to generate the isolated `.canyon` configuration directory:

```bash
python3 <skill_dir>/prepare.py <import-root> .canyon
```
- Preserves application code, dependencies, and environment files.
- `.env` remains in the project root; credentials are never committed or copied to `.canyon`.
- Add required credential keys to `.canyon/.env.example` as documentation.

### 3. Configure workflow, adapters, and entrypoints

Edit `.canyon/config/workflow_config.yaml` to define the runtime topology:

```yaml
version: "1.0"
endpoint:
  agent: WorkflowAgent
  method: run

agents:
  WorkflowAgent:
    path: agents/workflow.py
    class: WorkflowAgent
    functions:
      - name: run
        args:
          query: str
        return_type: str
    replicas: 1
    stateful: false

  ResearchAgent:
    path: agents/researcher.py
    class: ResearchAgent
    functions:
      - name: search
        args:
          topic: str
        return_type: dict
    replicas: 2
    stateful: false
```

Record one representative test query in `.canyon/config/test_query.txt` (raw string, without Markdown fences).

### 4. Memory, scaling, and LLM cost governance

1. **State Isolation**:
   - Single-request shared state: Set `stateful: true` (routes requests to the same replica while allowing scale).
   - Multi-request in-memory state: Set `stateful: true` and `replicas: 1` (unscalable).
   - External database state: Set `stateful: false` (freely scalable).

2. **Autoscaling Policy (`.canyon/config/scaling.yaml`)**:
   ```yaml
   ResearchAgent:
     min_replicas: 1
     max_replicas: 5
     cpu_threshold: 75%
   ```

3. **LLM Access & Cost Limits (`.canyon/config/llms.yaml`)**:
   ```yaml
   limits:
     monthly_budget_usd: 100.00
     rate_limit_rpm: 60
   ```

4. **Extracted Prompts (`.canyon/config/prompts.yaml`)**:
   Extract hardcoded system instructions into named templates (`<agent>.<function>`) so prompts can be updated without rebuilding container images.

### 5. Static pre-deployment validation

Always run static validation from the application root before attempting any deployment:

```bash
canyonos validate
```

Validation verifies:
- Import graph and entrypoint reachability.
- Dependency compatibility via `uv pip compile`.
- Schema alignment between `workflow_config.yaml`, `scaling.yaml`, and `prompts.yaml`.

Validation exits 0 on success. Do not proceed to deployment if blockers or errors are reported.

### 6. Approval-gated deployment and testing

Deployment requires explicit user approval because it builds Docker images and spawns container replicas:

```bash
# 1. Deploy containers in background
canyonos deploy --serve false

# 2. Check deployment and replica status
canyonos status --json

# 3. Dispatch test query
canyonos test "$(cat .canyon/config/test_query.txt)"

# 4. Tail container logs
canyonos logs --no-follow
```

### 7. Observability, GPU monitoring, and cleanup

- **Observability**: CanyonOS natively captures OpenTelemetry metrics, logs, and traces. To connect an external collector, add an `otel:` destination in `workflow_config.yaml`.
- **GPU Acceleration**: On hosts with the NVIDIA Container Toolkit, GPU replicas report metrics via `nvidia-smi` and request hardware via `--gpus all` (or `nvidia.com/gpu` on Kubernetes).
- **Cleanup**:
  - `canyonos stop`: Halts running containers while preserving images and `.canyon`.
  - `canyonos clean`: Completely removes containers, images, and `.canyon`.

---

## References

- [Pinned Source & Manifest](references/source.json): CanyonOS v0.2.2 commit `49e9bd0` with SHA-256 hashes for 12 public source files.
- [Upstream Architecture & Recipes](references/upstream.md): Command lifecycle, runtime contract, GPU metric polling, and Kubernetes deployment guides.
- [Evaluation Scenarios](evals/evals.json): Five authored test scenarios covering conversion, scaling, validation, and routing.
