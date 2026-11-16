# Pinned CanyonOS Operator Notes

Repository: [CanyonCodeCoreAI/canyonos](https://github.com/CanyonCodeCoreAI/canyonos/tree/49e9bd042735aa88e694c9e1fc5069223ba19820). Snapshot: `49e9bd042735aa88e694c9e1fc5069223ba19820`, 2026-11-13, release **v0.2.2**. These are source-confirmed command recipes and architecture references, not proof of a local install or running deployment. Commands below require Docker Compose v2 and Python 3.10+; install and execute only after separate approval.

---

## Offline Preflight

From any directory, with `SKILL_DIR` pointing to this package's canonical real directory (no symlink components):

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
python3 "$SKILL_DIR/scripts/preflight.py" --json --repo /absolute/real/path/to/canyonos
```

The bundled helper reads `references/source.json`, discovers executable paths (`python3`, `uv`, `docker`, `canyonos`, `git`) without executing them, and hashes the 12 pinned files. Source matches verify **selected bytes only**, not whole-tree integrity, Git HEAD, running containers, or container daemon health. Missing optional tools are informational. Exit `0` is successful inventory or matching selected source bytes; `1` is missing/mismatched selected source; `2` is unsafe input or malformed manifest.

---

## Installation: Docs Only versus Platform Runtime

Catalog and setup installation copies this skill's documentation and support files only. It does not install CanyonOS, Docker containers, agent images, or provider credentials.

### Upstream Installation Methods (requires approval)

```bash
# 1. Official standalone installer script (download, inspect, then execute)
curl -fsSL https://raw.githubusercontent.com/CanyonCodeCoreAI/canyonos/main/packages/cli/install.sh -o install.sh
# Review install.sh before running:
sh install.sh

# 2. uv tool install
uv tool install canyonos

# 3. pip install
pip install canyonos
```

To verify local prerequisites and Docker daemon accessibility:

```bash
canyonos doctor
```

---

## Porting Agent Projects to CanyonOS

CanyonOS deploys existing plain Python, LangChain, or LangGraph multi-agent projects without SDKs or code modifications:

1. **Non-invasive `.canyon` artifact**:
   Run `prepare.py` to inspect the project import root and establish the `.canyon` configuration workspace:
   ```bash
   python3 <skill_dir>/prepare.py <import-root> .canyon
   ```
   - Only edits `.canyon` and updates `.gitignore`.
   - Never copies or reads `.env`; credentials remain in project root and are passed to containers at deploy time.
   - Refuses import roots containing existing `config/`, `stubs/`, `grpc_stubs/`, or `docker_container/` directories.

2. **Agent Adapters & Runtime Contract**:
   - Each agent maps to one container replica exposing methods via `functions`.
   - Write adapters beside existing classes; reuse compatible classes directly.
   - Declare entrypoint in `config/workflow_config.yaml`:
     ```yaml
     endpoint:
       agent: WorkflowAgent
       method: run
     ```
   - Store one representative test input in `.canyon/config/test_query.txt`.

3. **Static Validation**:
   ```bash
   canyonos validate
   ```
   Static validation verifies image dependencies (`uv pip compile`), entrypoints, and routing table schemas without starting containers.

---

## Memory, Scaling, and GPU Management

CanyonOS governs agent state, autoscaling, and hardware allocation across configuration files:

### 1. State Isolation (`config/workflow_config.yaml`)
- Request-scoped state: `stateful: true` routes calls to one replica during the request while allowing horizontal scale.
- Cross-request in-process state: `stateful: true` and `replicas: 1` (unscalable).
- External database state: scalable across replicas.

### 2. Autoscaling & Cost Caps (`config/scaling.yaml` & `config/llms.yaml`)
- `scaling.yaml`: Defines min/max replicas, CPU/memory thresholds, and queue concurrency limits.
- `llms.yaml`: Specifies permitted model tiers (e.g. OpenAI, Anthropic, Bedrock, or local endpoints) and monthly/hourly spend caps.
- `prompts.yaml`: Extracts system instructions into versioned YAML templates without baking dynamic user inputs or secrets into the manifest.

### 3. GPU Hardware & NVIDIA Runtime
CanyonOS tracks GPU metrics via `nvidia-smi` and provisions GPU acceleration:
- Docker Engine: Uses `--gpus all` (requires NVIDIA Container Toolkit). If no GPU runtime is present, CPU fallback applies.
- Kubernetes Target: Injects `nvidia.com/gpu: <count>` into pod container resources.
- Metrics Poller: Periodically samples `canyonos.machine.gpu.utilization` via `gpu_metrics.py`.

---

## CLI Command Lifecycle

All lifecycle operations are executed from the application project root:

| Command | Purpose | Side Effects |
|---|---|---|
| `canyonos new-app` | Scaffold a new multi-agent project | Creates project folder with template agent classes |
| `canyonos validate` | Static pre-deployment linting | Checks imports, entrypoints, and `uv pip compile` lockfiles |
| `canyonos deploy --serve false` | Build images and start container replicas | Replaces earlier deploy; launches agent containers and Redis |
| `canyonos status --json` | Inspect running agents and health | Queries agent replica counts, ports, and launch errors |
| `canyonos test "$(cat .canyon/config/test_query.txt)"` | Send test query to endpoint | Dispatches query and prints execution trace |
| `canyonos logs [agent]` | Tail recent container logs | Dumps last 200 lines from specified agent or all replicas |
| `canyonos target kubernetes` | Switch deployment target | Generates Kubernetes manifests with pod specs and ConfigMaps |
| `canyonos stop` | Stop running project | Halts container execution without deleting images |
| `canyonos clean` | Deep cleanup | Removes `.canyon`, Docker images, and stopped containers |

---

## Licensing and Boundaries

- **License**: GNU Affero General Public License v3.0 (AGPL-3.0).
- **Evidence Boundary**: Pinned selected-file validation confirms source file hashes at commit `49e9bd042735aa88e694c9e1fc5069223ba19820`. It does not certify Docker daemon readiness, GPU availability, Kubernetes cluster state, or network access to model providers.
