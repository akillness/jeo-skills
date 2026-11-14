---
name: kagent
description: >
  Use when configuring, invoking, testing, or troubleshooting kagent Kubernetes-native AI agents, Agent and Harness CRDs, gRPC/A2A Sessions, or Substrate sandboxes. Covers discovering agents and templates, managing conversations via Sessions, streaming tasks over A2A, executing commands and transferring files in isolated sandboxes, or inspecting Kubernetes custom resources. Route format-only skill linting to skill-standardization, raw multi-agent protocol design to a2a-protocol, and standalone Kubernetes cluster deployment to deployment-automation.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.1
  source: https://github.com/kagent-dev/kagent
  upstream_commit: eb42f649dfae710a6808316b5af85cc56f529b8d
---

# kagent

## When to use this skill

Use when configuring, invoking, testing, or troubleshooting kagent agents, custom resources, conversations, or sandboxes. kagent is a Kubernetes-native framework for building, deploying, and operating AI agents.

### Route-outs
- For validating Agent Skills specification format, frontmatter, or directory structure, use `skill-standardization`.
- For raw horizontal Agent-to-Agent communication protocols without the kagent Kubernetes runtime, use `a2a-protocol`.
- For provisioning base Kubernetes clusters or managing cloud provider infrastructure, use `deployment-automation` or `environment-setup`.
- For evaluation benchmarks across LLMs or agents, use `agent-benchmarking` or `nvidia-skill-evaluator`.

## Instructions

### 1. Offline environment preflight

Before proposing any live cluster or API operations, run the local offline preflight helper:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
```

This discovers local `kagent`, `kubectl`, `helm`, and `docker` binaries without network calls or process execution.

### 2. Work with agents and templates

Discover and manage agent definitions in Kubernetes:

```bash
# Discover agent definitions and reusable templates
kagent agent list
kagent agent get <name>
kagent agent template list
kagent agent template get <template-name>
```

- `Agent` (`api.kagent.dev/v1alpha3`) pairs inline or referenced template behavior with a referenced Harness adapter.
- `AgentTemplate` (`api.kagent.dev/v1alpha3`) describes prompts, tools, subagents, and LLM configuration.
- Catalog commands use the current kubeconfig context and selected namespace.
- Apply declarative configurations with `kagent apply -f <manifest.yaml>` or `kubectl apply -f <manifest.yaml>`.

### 3. Manage Sessions and invoke tasks via A2A

Conversations and runtime lifecycles are managed through Sessions (backed by PostgreSQL and gRPC, not Kubernetes CRDs):

```bash
# Create a conversation session (always provide a unique request-id for idempotent retries)
kagent agent session create --agent <name> --request-id <unique-request-id>

# List and inspect sessions
kagent agent session list
kagent agent session get <session-id>

# Invoke an agent conversation through A2A
kagent agent invoke --session <session-id> --task "Analyze recent pod failures in the prod namespace"
# Stream response tokens:
kagent agent invoke --session <session-id> --task "Generate migration YAML" --stream

# Delete a session (cleans up runtime resources while preserving the agent CRD)
kagent agent session delete <session-id>
```

### 4. Use standalone Substrate sandboxes for isolated tasks

When a task needs an isolated environment to run code, process data, or produce artifacts without agent conversation overhead, use kagent sandboxes:

```bash
# Discover available sandbox templates
kagent sandbox templates -n <namespace> -o json

# Create a sandbox with bounded TTL
kagent sandbox create <template-name> -n <namespace> --request-id <unique-request-id> --ttl 15m -o json

# Transfer input files (streaming upload up to 64 MiB)
kagent sandbox upload <sandbox-id> ./input.py /data/workspace/input.py

# Execute command inside sandbox
kagent sandbox exec <sandbox-id> -- python3 /data/workspace/input.py

# Download output artifacts
kagent sandbox download <sandbox-id> summary.json ./summary.json

# Delete sandbox when done
kagent sandbox delete <sandbox-id>
```

See [Working in sandboxes](references/sandboxes.md) for full CLI commands, MCP tool mappings, recovery workflows, and agent setup instructions.

### 5. Architectural boundaries and safety gates

Read [Architecture and CRDs](references/architecture-and-crds.md) to understand resource ownership:
- **Kubernetes owns desired state:** `Agent`, `Harness`, `AgentTemplate`, `SandboxTemplate`, `EgressPolicy`.
- **PostgreSQL owns runtime state:** `Session`, `Sandbox`, tasks, checkpoints, and conversation events.
- **Substrate Actors execute workloads:** Private compute engine handling lifecycle, snapshots, and durable directories.
- **Egress boundaries:** Sandboxes default to zero allowed egress; external HTTP(S) destinations require explicit `EgressPolicy` configuration.
- **Credential safety:** Never place API tokens or secrets directly in AgentTemplate manifests. Reference Kubernetes Secrets that Substrate injects at the egress gateway.

## Examples

### Example 1: Creating and invoking an agent session

```bash
# 1. Create a session with an idempotent request ID
kagent agent session create --agent k8s-debugger --request-id req-$(date +%s)
# Output returns session ID: sess-0192a4bc

# 2. Invoke the agent to diagnose cluster issues
kagent agent invoke --session sess-0192a4bc --task "Check crashed pods in ingress-nginx namespace" --stream

# 3. Clean up the session when finished
kagent agent session delete sess-0192a4bc
```

### Example 2: Running offline data transformation in a sandbox

```bash
# 1. Create a Python sandbox for 10 minutes
kagent sandbox create python-runner -n default --request-id req-sandbox-$(date +%s) --ttl 10m -o json

# 2. Stage the input script
kagent sandbox upload 8f24bc91 ./process.py process.py

# 3. Execute the script within workspace
kagent sandbox exec 8f24bc91 -- python3 process.py

# 4. Download generated output and clean up
kagent sandbox download 8f24bc91 output.json ./output.json
kagent sandbox delete 8f24bc91
```

## Best practices

- **Always retain request IDs:** Pass `--request-id` on session and sandbox creation so transient retries do not spawn duplicate resources.
- **Inspect template readiness:** Check `kubectl get sandboxtemplate <name> -o yaml` condition `Ready` before creating sandboxes.
- **Clean up scratch resources:** Delete completed sessions and scratch sandboxes to avoid holding Substrate Actor slots.
- **Use Secret references:** Store LLM provider API keys in Kubernetes Secrets; never commit plaintext keys in version-controlled manifests.
- **Respect egress constraints:** Standalone sandboxes forbid external network traffic by default; stage all inputs explicitly via file upload.

## References

- [Working in sandboxes](references/sandboxes.md): Complete CLI and MCP sandbox guide, process monitoring, file streaming, and recovery.
- [Architecture and CRDs](references/architecture-and-crds.md): Resource ownership matrix, control plane contracts, and component boundaries.
- [Source and upstream notes](references/sources.md): Pinned repository snapshot, commit metadata, and license documentation.
- [Evaluation scenarios](evals/evals.json): Behavioral evaluation cases for kagent operator guidance.
